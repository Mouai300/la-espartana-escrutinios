'use strict';

const {
    applyCommand
  } = require('./commands'),
  {
    fault
  } = require('./storage/sqlcipher');
// No entrega una instantánea después de perder el acceso, aunque termine una lectura tardía.
function createWorkspace({
  access,
  now
}) {
  let data = null,
    epoch = 0,
    busy = false,
    disposed = false,
    unsubscribe = null;
  const listeners = new Set();
  function notify() {
    for (const fn of listeners) try {
      fn();
    } catch {}
  }
  function connect(){
    if(unsubscribe)return;
    disposed=false;
    unsubscribe=access.subscribe(({status})=>{if(status!=='unlocked'){epoch++;data=null;notify();}});
  }
  connect();
  function ticket() {
    if (disposed || !data || access.getStatus().status !== 'unlocked') throw fault('LOCKED');
    return {
      epoch,
      revision: data.revision
    };
  }
  function assertTicket(value) {
    if (disposed || !value || value.epoch !== epoch || !data || value.revision !== data.revision || access.getStatus().status !== 'unlocked') throw fault('STALE_VIEW');
  }
  return {
    connect,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    snapshot: () => data,
    isBusy: () => busy,
    ticket,
    assertTicket,
    async load() {
      if(disposed)throw fault('LOCKED');
      if (busy) throw fault('WORKSPACE_BUSY');
      busy = true;
      const stamp = epoch;
      notify();
      try {
        const value = await access.read();
        if (stamp !== epoch) throw fault('LOCKED');
        data = value;
        notify();
        return value;
      } finally {
        busy = false;
        notify();
      }
    },
    async apply(command, value = ticket()) {
      assertTicket(value);
      if (busy) throw fault('WORKSPACE_BUSY');
      busy = true;
      notify();
      try {
        assertTicket(value);
        const next = applyCommand(data.state, command, now());
        const saved = await access.write(next, value.revision);
        assertTicket(value);
        data = {
          state: next,
          revision: saved.revision
        };
        notify();
        return data;
      } catch (error) {
        if (error?.code === 'REVISION_CONFLICT') {
          data = null;
          notify();
        }
        throw error;
      } finally {
        busy = false;
        notify();
      }
    },
    dispose() {
      unsubscribe?.();
      unsubscribe=null;
      disposed=true;
      epoch++;
      data = null;
      listeners.clear();
    }
  };
}
module.exports = {
  createWorkspace
};
