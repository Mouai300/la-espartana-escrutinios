'use strict';

const {
  validatePassword,
  validateEnvelope
} = require('./backup');
const {
  decodeState,
  encodeState
} = require('./state');
const {
  fault
} = require('./storage/sqlcipher');

// Recuperación sin leer ni sobrescribir la base cuya clave se perdió.
// Los puertos nativos autentican y cambian el puntero mediante compare-and-swap.
function createVaultRecovery({
  access,
  codec,
  storage,
  now
}) {
  let epoch = 0,
    phase = 'idle',
    prepared = null,
    busy = false,
    reservation = null;
  function release() {
    reservation?.release();
    reservation = null;
  }
  function cancel() {
    epoch++;
    prepared = null;
    phase = 'idle';
    if (!busy) release();
  }
  function guard(stamp) {
    if (stamp !== epoch) throw fault('RECOVERY_CANCELLED');
  }
  async function operation(work) {
    if (busy) throw fault('RECOVERY_BUSY');
    busy = true;
    try {
      return await work();
    } finally {
      busy = false;
      if (phase === 'idle') release();
    }
  }
  return {
    getStatus: () => ({
      phase
    }),
    cancel,
    onAppState(value) {
      if (value === 'background') cancel();
    },
    prepare(text, password) {
      return operation(async () => {
        const stamp = ++epoch;
        prepared = null;
        phase = 'preparing';
        try {
          validatePassword(password);
          validateEnvelope(text);
          reservation ??= access.hold();
          await reservation.ready;
          guard(stamp);
          const previous = await storage.getActiveId();
          guard(stamp);
          await storage.authenticate();
          guard(stamp);
          const state = decodeState(await codec.open(text, password));
          guard(stamp);
          const token = Object.freeze({});
          prepared = {
            token,
            state,
            previous,
            stamp
          };
          phase = 'review';
          return {
            token,
            files: state.files.length,
            rounds: state.rounds.length,
            columns: state.files.reduce((n, f) => n + f.bets.length, 0)
          };
        } catch (error) {
          if (stamp === epoch) {
            prepared = null;
            phase = 'idle';
          }
          throw error;
        }
      });
    },
    commit(token) {
      return operation(async () => {
        if (!prepared || prepared.token !== token) throw fault('RECOVERY_REVIEW_REQUIRED');
        const item = prepared;
        prepared = null;
        phase = 'committing';
        const assertAccess = () => guard(item.stamp);
        let staged = null;
        try {
          assertAccess();
          staged = await storage.createStaging(assertAccess);
          assertAccess();
          if (staged.id === item.previous) throw fault('RECOVERY_NOT_ISOLATED');
          const initial = await staged.store.read();
          assertAccess();
          if (initial.revision !== 0) throw fault('RECOVERY_NOT_EMPTY');
          const state = {
            ...item.state,
            modifiedAt: now(),
            lastBackupAt: null
          };
          await staged.store.write(state, 0);
          assertAccess();
          const verified = await staged.store.read();
          assertAccess();
          if (verified.revision !== 1 || encodeState(verified.state) !== encodeState(state)) throw fault('RECOVERY_VERIFY_FAILED');
          await staged.store.close();
          const id = staged.id;
          staged = null;
          assertAccess();
          // Punto de commit: tras él, una suspensión no deshace un cambio ya confirmado.
          await storage.activate(item.previous, id);
          assertAccess();
          phase = 'idle';
          return {
            restored: true
          };
        } finally {
          if (staged) try {
            await staged.store.close();
          } catch {/* No activar ni borrar el original tras un cierre fallido. */}
          if (item.stamp === epoch) phase = 'idle';
        }
      });
    }
  };
}
module.exports = {
  createVaultRecovery
};
