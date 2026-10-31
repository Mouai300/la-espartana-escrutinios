'use strict';

const S = require('./state');
const {
  fault
} = require('./storage/sqlcipher');

// El archivo original se lee, nunca se modifica. No conserva apuestas en la vista previa.
function inspectLegacy(text, now) {
  if (typeof text !== 'string' || text.length > S.MAX_STATE_CHARS) throw fault('MIGRATION_INVALID');
  try {
    const old = JSON.parse(text);
    if (!old || ![1, 2].includes(old.version) || !Array.isArray(old.files) || !Array.isArray(old.rounds) || old.files.length > 2000 || old.rounds.length > 2000) throw Error();
    const rounds = old.rounds.map(r => ({
      id: r.id,
      label: r.season + ' · ' + r.number
    }));
    const missing = old.files.filter(f => !rounds.some(r => r.id === f.roundId));
    if (missing.length && !rounds.length) throw fault('MIGRATION_ROUND_REQUIRED');
    // Solo para validar: esta asignación provisional NO se muestra ni se guarda como elección.
    const validationMapping = Object.fromEntries(missing.map(f => [f.id, rounds[0].id]));
    const result = S.migrateLegacy(text, {
      now,
      roundMapping: validationMapping
    });
    return {
      ...result.review,
      availableRounds: rounds,
      unassigned: missing.map(f => ({
        id: f.id,
        name: f.name
      }))
    };
  } catch (error) {
    if (error?.code === 'MIGRATION_ROUND_REQUIRED') throw error;
    throw fault('MIGRATION_INVALID');
  }
}
function createLegacyImport({
  workspace,
  recovery,
  now
}) {
  let pending = null,
    epoch = 0,
    busy = false,
    disposed = false,
    unsubscribe = null;
  function cancel() {
    epoch++;
    if (pending?.token) recovery.cancel(pending.token);
    pending = null;
  }
  function connect() {
    if (unsubscribe) return;
    disposed = false;
    unsubscribe = workspace.subscribe(() => {
      if (!pending) return;
      try {
        workspace.assertTicket(pending.ticket);
      } catch {
        cancel();
      }
    });
  }
  function current() {
    if (disposed || !pending) throw fault('MIGRATION_REVIEW_REQUIRED');
    workspace.assertTicket(pending.ticket);
    return pending;
  }
  function idle() {
    if (busy) throw fault('WORKSPACE_BUSY');
  }
  connect();
  return {
    connect,
    cancel,
    load(text) {
      idle();
      cancel();
      if (disposed) throw fault('LOCKED');
      const ticket = workspace.ticket(),
        data = workspace.snapshot();
      if (data.revision !== 0 || data.state.files.length || data.state.rounds.length) throw fault('MIGRATION_NOT_EMPTY');
      const info = inspectLegacy(text, now());
      workspace.assertTicket(ticket);
      pending = {
        text,
        ticket,
        info,
        token: null
      };
      return JSON.parse(JSON.stringify(info));
    },
    async prepare(mapping = {}) {
      idle();
      const item = current(),
        stamp = epoch;
      if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) throw fault('MIGRATION_MAPPING_REQUIRED');
      const allowed = new Set(item.info.unassigned.map(f => f.id));
      if (Object.keys(mapping).some(id => !allowed.has(id)) || item.info.unassigned.some(f => !Object.hasOwn(mapping, f.id) || !item.info.availableRounds.some(r => r.id === mapping[f.id]))) throw fault('MIGRATION_MAPPING_REQUIRED');
      if (item.token) {
        recovery.cancel(item.token);
        item.token = null;
      }
      busy = true;
      let prepared;
      try {
        prepared = await recovery.prepareMigration(item.text, {
          roundMapping: {
            ...mapping
          }
        });
        if (stamp !== epoch || disposed) throw fault('STALE_VIEW');
        workspace.assertTicket(item.ticket);
        item.token = prepared.token;
        return {
          rounds: prepared.rounds,
          files: prepared.files,
          columns: prepared.columns,
          notes: prepared.notes
        };
      } catch (error) {
        if (prepared) recovery.cancel(prepared.token);
        throw error;
      } finally {
        busy = false;
      }
    },
    async commit({
      confirmed = false
    } = {}) {
      idle();
      const item = current();
      if (!confirmed || !item.token) throw fault('MIGRATION_REVIEW_REQUIRED');
      const token = item.token;
      pending = null;
      epoch++;
      busy = true;
      try {
        return await recovery.commit(token);
      } finally {
        recovery.cancel(token);
        busy = false;
      }
    },
    dispose() {
      cancel();
      unsubscribe?.();
      unsubscribe = null;
      disposed = true;
    }
  };
}
module.exports = {
  inspectLegacy,
  createLegacyImport
};
