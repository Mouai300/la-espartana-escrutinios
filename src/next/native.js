import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';
import * as SQLite from 'expo-sqlite';
import { File } from 'expo-file-system';
const {
  openEncryptedStore,
  fault
} = require('./storage/sqlcipher');
const {
  createAccessController
} = require('./access');
const {
  createRecoveryService
} = require('./backup');
const {
  createVaultRecovery
} = require('./vault-recovery');

// No se conecta todavía a App.js. Requiere compilación propia con SQLCipher.
export function createNativeVault() {
  if (Platform.OS !== 'ios') throw fault('NATIVE_IOS_REQUIRED');
  const vault = requireNativeModule('EspartanaVault');
  const now = () => new Date().toISOString();
  async function location(id) {
    if (id !== 'legacy' && (typeof id !== 'string' || id.length !== 32 || !/^[a-f0-9]{32}$/.test(id))) throw fault('INVALID_VAULT_ID');
    return {
      name: id === 'legacy' ? 'espartana-v3.db' : `vault-${id}.db`,
      directory: id === 'legacy' ? SQLite.defaultDatabaseDirectory : await vault.vaultDirectory()
    };
  }
  async function open(id, allowCreate, assertAccess) {
    const {
      name,
      directory
    } = await location(id);
    assertAccess();
    const exists = new File(directory, name).exists;
    if (!exists && !allowCreate) throw fault('MISSING_DATABASE');
    if (exists && allowCreate && id !== 'legacy') throw fault('RECOVERY_NOT_EMPTY');
    let key = null,
      store = null;
    try {
      key = await vault.unlockVaultKey(id, allowCreate && !exists);
      assertAccess();
      store = await openEncryptedStore({
        openDatabase: () => SQLite.openDatabaseAsync(name, {
          useNewConnection: true
        }, directory),
        keyHex: key,
        assertAccess,
        now
      });
      await vault.protectDatabase(id);
      assertAccess();
      return store;
    } catch (error) {
      if (store) try {
        await store.close();
      } catch {}
      throw error;
    } finally {
      key = null;
    }
  }
  const access = createAccessController({
    openStore: async assertAccess => {
      const info = await vault.getActiveVaultInfo();
      assertAccess();
      const store = await open(info.id, !info.initialized && info.id === 'legacy', assertAccess);
      try {
        if (!info.initialized) await vault.registerLegacyVault();
        assertAccess();
        return store;
      } catch (error) {
        await store.close();
        throw error;
      }
    }
  });
  const recovery = createRecoveryService({
    access,
    now,
    codec: {
      seal: (text, password) => vault.sealBackup(text, password),
      open: (text, password) => vault.openBackup(text, password)
    }
  });
  const lostKeyRecovery = createVaultRecovery({
    access,
    now,
    codec: {
      open: (text, password) => vault.openBackup(text, password)
    },
    storage: {
      getActiveId: () => vault.getRecoveryAnchor(),
      authenticate: () => vault.authenticateDevice(),
      createStaging: async assertAccess => {
        const id = vault.createVaultId();
        return {
          id,
          store: await open(id, true, assertAccess)
        };
      },
      activate: (expected, id) => vault.activateVault(expected, id)
    }
  });
  return {
    access,
    recovery,
    lostKeyRecovery,
    readImportText: (uri, kind) => vault.readImportText(uri, kind),
    createBackupCopy: text => vault.createBackupCopy(text),
    removeBackupCopy: uri => vault.removeBackupCopy(uri),
    readDocument: (uri, kind) => requireNativeModule('EspartanaReader').reviewCachedDocument(uri, kind),
    discardDocument: uri => requireNativeModule('EspartanaReader').discardCachedDocument(uri),
    renderReport: (html, label, footer) => vault.renderReport(html, label, footer),
    removeReport: uri => vault.removeReport(uri),
    onAppState(value) {
      access.onAppState(value);
      lostKeyRecovery.onAppState(value);
    }
  };
}
