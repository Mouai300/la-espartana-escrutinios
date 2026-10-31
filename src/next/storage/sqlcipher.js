'use strict';

const {
  decodeState,
  encodeState,
  emptyState
} = require('../state');
function fault(code) {
  return Object.assign(new Error(code), {
    code
  });
}
// No se admite SQLite sin SQLCipher. Ningún contenido del usuario se concatena en SQL.
async function openEncryptedStore({
  openDatabase,
  keyHex,
  assertAccess,
  now
}) {
  if (typeof keyHex !== 'string' || keyHex.length !== 64 || !/^[a-f0-9]{64}$/.test(keyHex)) throw fault('INVALID_KEY');
  assertAccess();
  const db = await openDatabase();
  let tail = Promise.resolve(),
    closing = false,
    poisoned = false;
  // Expo 54 withExclusiveTransactionAsync abre otra conexión sin la clave.
  // Usamos la conexión privada ya cifrada, serializada, y BEGIN IMMEDIATE.
  async function transaction(work) {
    await db.execAsync('BEGIN IMMEDIATE');
    try {
      await work(db);
      assertAccess();
      await db.execAsync('COMMIT');
    } catch (error) {
      try {
        await db.execAsync('ROLLBACK');
      } catch {
        poisoned = true;
      }
      throw error;
    }
  }
  try {
    assertAccess();
    const cipher = await db.getFirstAsync('PRAGMA cipher_version');
    if (!cipher || typeof cipher.cipher_version !== 'string' || !cipher.cipher_version.trim()) throw fault('CIPHER_UNAVAILABLE');
    await db.execAsync(`PRAGMA key = "x'${keyHex}'"`);
    keyHex = null;
    assertAccess();
    await db.getFirstAsync('SELECT count(*) AS n FROM sqlite_master');
    await db.execAsync('PRAGMA foreign_keys=ON');
    await transaction(async tx => {
      const meta = await tx.getFirstAsync('PRAGMA user_version');
      if (!meta || ![0, 1].includes(meta.user_version)) throw fault('DATABASE_VERSION');
      if (meta.user_version === 0) {
        const tables = await tx.getFirstAsync("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
        if (tables.n !== 0) throw fault('DATABASE_VERSION');
        await tx.execAsync('CREATE TABLE snapshot (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL CHECK(revision>=1), payload TEXT NOT NULL); PRAGMA user_version=1');
      } else {
        const row = await tx.getFirstAsync('SELECT revision,payload FROM snapshot WHERE id=1');
        if (row) {
          revision(row);
          decodeState(row.payload);
        }
      }
    });
    assertAccess();
  } catch (error) {
    keyHex = null;
    try {
      await db.closeAsync();
    } catch {}
    throw error;
  }
  function queue(work) {
    if (closing) return Promise.reject(fault('CLOSED'));
    const job = tail.then(async () => {
      assertAccess();
      if (poisoned) throw fault('STORE_UNAVAILABLE');
      return work();
    });
    tail = job.catch(() => {});
    return job;
  }
  function revision(row) {
    if (!Number.isSafeInteger(row.revision) || row.revision < 1) throw fault('CORRUPT_REVISION');
    return row.revision;
  }
  return {
    read: () => queue(async () => {
      const row = await db.getFirstAsync('SELECT revision,payload FROM snapshot WHERE id=1');
      assertAccess();
      return row ? {
        revision: revision(row),
        state: decodeState(row.payload)
      } : {
        revision: 0,
        state: emptyState(now())
      };
    }),
    write: (state, expectedRevision) => {
      let payload;
      try {
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER) throw fault('INVALID_REVISION');
        payload = encodeState(state);
      } catch (error) {
        return Promise.reject(error);
      }
      return queue(async () => {
        let next;
        await transaction(async tx => {
          assertAccess();
          const row = await tx.getFirstAsync('SELECT revision,payload FROM snapshot WHERE id=1');
          assertAccess();
          if (row) decodeState(row.payload);
          const actual = row ? revision(row) : 0;
          if (actual !== expectedRevision) throw fault('REVISION_CONFLICT');
          next = actual + 1;
          const result = row ? await tx.runAsync('UPDATE snapshot SET revision=?,payload=? WHERE id=1 AND revision=?', next, payload, actual) : await tx.runAsync('INSERT INTO snapshot (id,revision,payload) VALUES (1,?,?)', next, payload);
          if (result.changes !== 1) throw fault('REVISION_CONFLICT');
          assertAccess();
        });
        assertAccess();
        return {
          revision: next
        };
      });
    },
    close: () => {
      closing = true;
      const job = tail.then(() => db.closeAsync());
      tail = job.catch(() => {});
      return job;
    }
  };
}
module.exports = {
  openEncryptedStore,
  fault
};
