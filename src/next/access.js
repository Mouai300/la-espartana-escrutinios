'use strict';

const {
  fault
} = require('./storage/sqlcipher');
// El llamador nativo debe ocultar y vaciar su vista privada al recibir locked/unlocking.
function createAccessController({
  openStore
}) {
  let status = 'locked',
    epoch = 0,
    store = null,
    pending = null,
    closing = Promise.resolve(),
    errorCode = null;
  const listeners = new Set();
  const holds = new Set();
  const getStatus = () => ({
    status,
    errorCode
  });
  function emit() {
    for (const fn of listeners) try {
      fn(getStatus());
    } catch {/* Un error de la vista no debe impedir el bloqueo. */}
  }
  function lock() {
    epoch++;
    status = 'locked';
    errorCode = null;
    const current = store;
    store = null;
    pending = null;
    if (current) {
      closing = closing.then(() => current.close());
      closing.catch(() => {});
    }
    emit();
    return closing;
  }
  function unlock() {
    if (holds.size) return Promise.reject(fault('RECOVERY_IN_PROGRESS'));
    if (status === 'unlocked') return Promise.resolve(getStatus());
    if (pending) return pending;
    const stamp = epoch;
    status = 'unlocking';
    errorCode = null;
    emit();
    const assertAccess = () => {
      if (stamp !== epoch || status === 'locked') throw fault('LOCKED');
    };
    const attempt = (async () => {
      let candidate = null;
      try {
        await closing;
        assertAccess();
        candidate = await openStore(assertAccess);
        assertAccess();
        store = candidate;
        candidate = null;
        status = 'unlocked';
        emit();
        return getStatus();
      } catch (error) {
        if (candidate) try {
          await candidate.close();
        } catch {}
        if (stamp === epoch) {
          status = 'locked';
          errorCode = error?.code === 'CIPHER_UNAVAILABLE' ? 'CIPHER_UNAVAILABLE' : 'UNLOCK_FAILED';
          emit();
        }
        throw fault(stamp !== epoch ? 'LOCKED' : errorCode || 'UNLOCK_FAILED');
      } finally {
        if (pending === attempt) pending = null;
      }
    })();
    pending = attempt;
    return attempt;
  }
  async function run(work) {
    if (status !== 'unlocked' || !store) throw fault('LOCKED');
    const stamp = epoch,
      current = store;
    const assertAccess = () => {
      if (stamp !== epoch || status !== 'unlocked') throw fault('LOCKED');
    };
    const result = await work(current, assertAccess);
    assertAccess();
    return result;
  }
  return {
    getStatus,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    lock,
    hold() {
      const token=Object.freeze({});holds.add(token);
      const ready=lock();
      return {ready,release(){holds.delete(token);}};
    },
    unlock,
    read: () => run(s => s.read()),
    write: (state, revision) => run(s => s.write(state, revision)),
    run,
    onAppState(value) {
      if (value === 'background' || value === 'inactive' && status === 'unlocked') lock();
    }
  };
}
module.exports = {
  createAccessController
};
