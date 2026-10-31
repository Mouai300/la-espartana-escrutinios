'use strict';

const {
  encodeState,
  decodeState,
  migrateLegacy
} = require('./state');
const FORMAT = 'la-espartana-backup',
  ITERATIONS = 600000,
  MAX_BACKUP_CHARS = 28000000;
const AAD = 'LaEspartana/backup/v1/AES-256-GCM/PBKDF2-HMAC-SHA256/600000';
function check(ok, message) {
  if (!ok) throw new Error(message);
}
function validatePassword(password) {
  check(typeof password === 'string' && Array.from(password).length >= 12 && password.length <= 256, 'Utiliza una contraseña de 12 a 256 caracteres.');
  return password;
}
function base64(value, min, max) {
  return typeof value === 'string' && value.length >= min && value.length <= max && value.length % 4 === 0 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
}
function validateEnvelope(text) {
  check(typeof text === 'string' && text.length <= MAX_BACKUP_CHARS, 'Copia demasiado grande.');
  const x = JSON.parse(text);
  check(x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).sort().join(',') === 'cipher,format,iterations,kdf,salt,sealed,version', 'Formato de copia incorrecto.');
  check(x.format === FORMAT && x.version === 1 && x.cipher === 'AES-256-GCM' && x.kdf === 'PBKDF2-HMAC-SHA256' && x.iterations === ITERATIONS, 'Versión o cifrado de copia incompatible.');
  check(base64(x.salt, 24, 24) && x.salt.endsWith('==') && base64(x.sealed, 40, MAX_BACKUP_CHARS - 300), 'Contenido cifrado incorrecto.');
  return x;
}
function review(state) {
  return {
    rounds: state.rounds.length,
    files: state.files.length,
    columns: state.files.reduce((n, f) => n + f.bets.length, 0),
    modifiedAt: state.modifiedAt
  };
}
// El códec nativo usa CryptoKit/CommonCrypto. No hay alternativa de producción en texto plano.
function createRecoveryService({
  access,
  codec,
  now
}) {
  const prepared = new Map();
  function wipe() {
    prepared.clear();
  }
  access.subscribe(({
    status
  }) => {
    if (status !== 'unlocked') wipe();
  });
  function prepare(state, revision, kind) {
    prepared.clear();
    const token = Object.freeze({});
    prepared.set(token, {
      state,
      revision,
      kind
    });
    return {
      token,
      kind,
      ...review(state)
    };
  }
  return {
    async exportBackup(password) {
      validatePassword(password);
      return access.run(async (store, assertAccess) => {
        const {state} = await store.read();
        const text = await codec.seal(encodeState(state), password);
        validateEnvelope(text);
        assertAccess();
        return text;
      });
    },
    // No anotar respaldo hasta que el llamador confirme que se guardó y se verificó su descifrado.
    async verifySavedBackup(text, password) {
      validatePassword(password);
      validateEnvelope(text);
      return access.run(async store => {
        const decoded = decodeState(await codec.open(text, password));
        const current = await store.read();
        check(encodeState(current.state) === encodeState(decoded), 'El historial cambió desde la exportación. Genera otra copia.');
        const state = {
          ...current.state,
          lastBackupAt: now(),
          modifiedAt: current.state.modifiedAt
        };
        const result = await store.write(state, current.revision);
        return result;
      });
    },
    async prepareRestore(text, password) {
      validatePassword(password);
      validateEnvelope(text);
      return access.run(async (store, assertAccess) => {
        const current = await store.read();
        const state = decodeState(await codec.open(text, password));
        assertAccess();
        return prepare(state, current.revision, 'restore');
      });
    },
    async prepareMigration(text, options = {}) {
      return access.run(async (store, assertAccess) => {
        const current = await store.read();
        assertAccess();
        check(current.revision === 0 && current.state.files.length === 0 && current.state.rounds.length === 0, 'Importa la copia antigua en un historial vacío.');
        const migrated = migrateLegacy(text, {
          ...options,
          now: now()
        });
        return {
          ...prepare(migrated.state, 0, 'migration'),
          notes: migrated.review.notes
        };
      });
    },
    async commit(token) {
      check(prepared.has(token), 'La revisión ya no es válida.');
      const item = prepared.get(token);
      prepared.delete(token);
      return access.run(async store => {
        const state = {
          ...item.state,
          modifiedAt: now(),
          lastBackupAt: null
        };
        return store.write(state, item.revision);
      });
    },
    cancel(token) {
      prepared.delete(token);
    }
  };
}
module.exports = {
  FORMAT,
  ITERATIONS,
  AAD,
  MAX_BACKUP_CHARS,
  validateEnvelope,
  validatePassword,
  createRecoveryService
};
