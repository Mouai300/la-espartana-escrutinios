import ExpoModulesCore
import Security
import LocalAuthentication
import CryptoKit
import CommonCrypto
import Foundation
import UIKit

// Pendiente de compilación y prueba en iPhone. Sin clave de recuperación del desarrollador.
public final class EspartanaVaultModule: Module {
  private let service = "es.laespartana.local-vault.v1"
  private let account = "sqlcipher-256"
  private let aad = Data("LaEspartana/backup/v1/AES-256-GCM/PBKDF2-HMAC-SHA256/600000".utf8)
  private let iterations: UInt32 = 600000

  private struct ActiveVault: Codable {
    let version: Int
    let id: String
  }

  private func validId(_ id: String) -> Bool {
    id == "legacy" || (id.utf8.count == 32 && id.range(of: "^[a-f0-9]{32}$", options: .regularExpression) != nil)
  }

  private func vaultDirectory() throws -> URL {
    guard let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
      throw failure("DIRECTORY_UNAVAILABLE")
    }
    var url = base.appendingPathComponent("EspartanaVault", isDirectory: true)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true,
      attributes: [.protectionKey: FileProtectionType.complete])
    try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: url.path)
    var resources = URLResourceValues()
    resources.isExcludedFromBackup = true
    try url.setResourceValues(resources)
    return url
  }

  private func readActive() throws -> ActiveVault? {
    let url = try vaultDirectory().appendingPathComponent("active.json")
    do {
      let attrs = try FileManager.default.attributesOfItem(atPath: url.path)
      guard let size = attrs[.size] as? NSNumber, size.intValue > 0, size.intValue <= 1024 else {
        throw failure("INVALID_VAULT_POINTER")
      }
      let value = try JSONDecoder().decode(ActiveVault.self, from: Data(contentsOf: url))
      guard value.version == 1, validId(value.id) else { throw failure("INVALID_VAULT_POINTER") }
      return value
    } catch let error as NSError {
      if error.domain == NSCocoaErrorDomain && [NSFileNoSuchFileError, NSFileReadNoSuchFileError].contains(error.code) { return nil }
      throw error
    }
  }

  private func writeActive(_ id: String) throws {
    guard validId(id) else { throw failure("INVALID_VAULT_ID") }
    let url = try vaultDirectory().appendingPathComponent("active.json")
    try JSONEncoder().encode(ActiveVault(version: 1, id: id)).write(to: url,
      options: [.atomic, .completeFileProtection])
  }

  private func databaseURL(_ id: String) throws -> URL {
    guard validId(id) else { throw failure("INVALID_VAULT_ID") }
    if id == "legacy" {
      guard let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
        throw failure("DIRECTORY_UNAVAILABLE")
      }
      return documents.appendingPathComponent("SQLite/espartana-v3.db")
    }
    return try vaultDirectory().appendingPathComponent("vault-\(id).db")
  }

  private struct Envelope: Codable {
    let format: String
    let version: Int
    let cipher: String
    let kdf: String
    let iterations: UInt32
    let salt: String
    let sealed: String
  }

  private func failure(_ code: String) -> NSError {
    NSError(domain: "EspartanaVault", code: 1, userInfo: [NSLocalizedDescriptionKey: code])
  }

  private func randomData(_ count: Int) throws -> Data {
    var bytes = Data(count: count)
    let status = bytes.withUnsafeMutableBytes { buffer in
      SecRandomCopyBytes(kSecRandomDefault, count, buffer.baseAddress!)
    }
    guard status == errSecSuccess else { throw failure("RANDOM_FAILED") }
    return bytes
  }

  private func derive(_ password: String, salt: Data) throws -> SymmetricKey {
    guard password.unicodeScalars.count >= 12, password.utf16.count <= 256 else {
      throw failure("PASSWORD_LENGTH")
    }
    let passwordBytes = Array(password.utf8)
    var output = Data(count: 32)
    let status = passwordBytes.withUnsafeBytes { p in
      salt.withUnsafeBytes { s in
        output.withUnsafeMutableBytes { out in
          CCKeyDerivationPBKDF(CCPBKDFAlgorithm(kCCPBKDF2),
            p.bindMemory(to: CChar.self).baseAddress, passwordBytes.count,
            s.bindMemory(to: UInt8.self).baseAddress, salt.count,
            CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256), iterations,
            out.bindMemory(to: UInt8.self).baseAddress, 32)
        }
      }
    }
    guard status == kCCSuccess else { throw failure("KDF_FAILED") }
    return SymmetricKey(data: output)
  }

  private func authenticate() async throws -> LAContext {
    let context = LAContext()
    context.localizedCancelTitle = "Cancelar"
    var error: NSError?
    guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
      throw failure("DEVICE_PASSCODE_REQUIRED")
    }
    guard try await context.evaluatePolicy(.deviceOwnerAuthentication,
      localizedReason: "Desbloquear La Espartana Escrutinios") else {
      throw failure("AUTHENTICATION_FAILED")
    }
    return context
  }

  private func unlockKey(_ allowCreate: Bool, id: String = "legacy") async throws -> String {
    guard validId(id) else { throw failure("INVALID_VAULT_ID") }
    let context = try await authenticate()
    defer { context.invalidate() }
    let keyAccount = id == "legacy" ? account : account + "-" + id
    var query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: keyAccount,
      kSecAttrSynchronizable as String: false,
      kSecUseAuthenticationContext as String: context,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne
    ]
    var found: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &found)
    if status == errSecSuccess {
      guard let data = found as? Data, data.count == 32 else { throw failure("INVALID_KEY") }
      return data.map { String(format: "%02x", $0) }.joined()
    }
    guard status == errSecItemNotFound, allowCreate else { throw failure("KEY_UNAVAILABLE") }
    var accessError: Unmanaged<CFError>?
    guard let control = SecAccessControlCreateWithFlags(nil,
      kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly, .userPresence, &accessError) else {
      throw failure("ACCESS_CONTROL_FAILED")
    }
    let data = try randomData(32)
    query.removeValue(forKey: kSecReturnData as String)
    query.removeValue(forKey: kSecMatchLimit as String)
    query[kSecAttrAccessControl as String] = control
    query[kSecValueData as String] = data
    guard SecItemAdd(query as CFDictionary, nil) == errSecSuccess else { throw failure("KEY_CREATION_FAILED") }
    return data.map { String(format: "%02x", $0) }.joined()
  }

  public func definition() -> ModuleDefinition {
    Name("EspartanaVault")
    AsyncFunction("renderReport") { (html: String, label: String, footer: String) async throws -> String in
      try await EspartanaPDFRenderer.render(html, label: label, footer: footer)
    }
    AsyncFunction("removeReport") { (uri: String) async throws -> Bool in
      try await MainActor.run { try EspartanaPDFRenderer.remove(uri) }
    }
    AsyncFunction("readImportText") { (uri: String, kind: String) throws -> String in
      let limits = ["txt": 2000000, "backup": 28000000, "legacy": 20000000]
      guard let limit = limits[kind], let supplied = URL(string: uri), supplied.isFileURL,
        let cache = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else {
        throw self.failure("INVALID_IMPORT")
      }
      let url = supplied.standardizedFileURL.resolvingSymlinksInPath()
      let root = cache.standardizedFileURL.resolvingSymlinksInPath().path + "/"
      guard url.path.hasPrefix(root) else { throw self.failure("IMPORT_NOT_CACHED") }
      let attrs = try FileManager.default.attributesOfItem(atPath: url.path)
      guard attrs[.type] as? FileAttributeType == .typeRegular else { throw self.failure("INVALID_IMPORT") }
      // Solo elimina la copia de caché, nunca el documento original del proveedor.
      defer { try? FileManager.default.removeItem(at: url) }
      guard let expected = attrs[.size] as? NSNumber, expected.intValue <= limit else { throw self.failure("IMPORT_TOO_LARGE") }
      try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: url.path)
      let handle = try FileHandle(forReadingFrom: url)
      defer { try? handle.close() }
      var data = Data()
      while data.count <= limit {
        let part = try handle.read(upToCount: min(65536, limit + 1 - data.count)) ?? Data()
        if part.isEmpty { break }
        data.append(part)
      }
      guard data.count <= limit, data.count == expected.intValue, let text = String(data: data, encoding: .utf8) else {
        throw self.failure("IMPORT_TOO_LARGE_OR_ENCODING")
      }
      return text
    }
    AsyncFunction("createBackupCopy") { (text: String) throws -> String in
      guard text.utf8.count <= 28000000,
        let cache = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else { throw self.failure("BACKUP_TOO_LARGE") }
      let envelope = try JSONDecoder().decode(Envelope.self, from: Data(text.utf8))
      guard envelope.format == "la-espartana-backup", envelope.version == 1 else { throw self.failure("INVALID_BACKUP") }
      let directory = cache.appendingPathComponent("EspartanaBackups", isDirectory: true)
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
        attributes: [.protectionKey: FileProtectionType.complete])
      let url = directory.appendingPathComponent("La-Espartana-\(UUID().uuidString).json")
      try Data(text.utf8).write(to: url, options: [.atomic, .completeFileProtection])
      return url.absoluteString
    }
    AsyncFunction("removeBackupCopy") { (uri: String) throws -> Bool in
      guard let supplied = URL(string: uri), supplied.isFileURL,
        let cache = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else { throw self.failure("INVALID_BACKUP_PATH") }
      let url = supplied.standardizedFileURL.resolvingSymlinksInPath()
      let root = cache.appendingPathComponent("EspartanaBackups").standardizedFileURL.resolvingSymlinksInPath().path + "/"
      guard url.path.hasPrefix(root) else { throw self.failure("INVALID_BACKUP_PATH") }
      try FileManager.default.removeItem(at: url)
      return true
    }
    AsyncFunction("unlockKey") { (allowCreate: Bool) async throws -> String in
      try await self.unlockKey(allowCreate)
    }
    AsyncFunction("unlockVaultKey") { (id: String, allowCreate: Bool) async throws -> String in
      try await self.unlockKey(allowCreate, id: id)
    }
    AsyncFunction("authenticateDevice") { () async throws -> Bool in
      let context = try await self.authenticate()
      context.invalidate()
      return true
    }
    Function("createVaultId") {
      UUID().uuidString.lowercased().replacingOccurrences(of: "-", with: "")
    }
    AsyncFunction("vaultDirectory") { () throws -> String in
      try self.vaultDirectory().absoluteString
    }
    AsyncFunction("getActiveVaultInfo") { () throws -> [String: Any] in
      let value = try self.readActive()
      if value == nil {
        let files = try FileManager.default.contentsOfDirectory(atPath: self.vaultDirectory().path)
        guard !files.contains(where: { $0.hasPrefix("vault-") && $0.hasSuffix(".db") }) else {
          throw self.failure("RECOVERY_POINTER_REQUIRED")
        }
      }
      return ["id": value?.id ?? "legacy", "initialized": value != nil]
    }
    AsyncFunction("getRecoveryAnchor") { () throws -> String in
      // Solo el flujo de restauración explícita puede continuar sin puntero.
      // Nunca abre ni borra las bases encontradas; activa una copia nueva revisada.
      try self.readActive()?.id ?? "legacy"
    }
    AsyncFunction("registerLegacyVault") { () async throws -> Bool in
      try await MainActor.run {
        if let active = try self.readActive() {
          guard active.id == "legacy" else { throw self.failure("VAULT_CONFLICT") }
        } else {
          guard FileManager.default.fileExists(atPath: try self.databaseURL("legacy").path) else { throw self.failure("MISSING_DATABASE") }
          try self.writeActive("legacy")
        }
        return true
      }
    }
    AsyncFunction("protectDatabase") { (id: String) throws -> Bool in
      var url = try self.databaseURL(id)
      try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: url.path)
      var resources = URLResourceValues()
      resources.isExcludedFromBackup = true
      try url.setResourceValues(resources)
      return true
    }
    AsyncFunction("activateVault") { (expected: String, id: String) async throws -> Bool in
      guard self.validId(expected), self.validId(id), id != "legacy", id != expected else { throw self.failure("INVALID_VAULT_ID") }
      let context = try await self.authenticate()
      defer { context.invalidate() }
      return try await MainActor.run {
        guard UIApplication.shared.applicationState != .background else { throw self.failure("RECOVERY_CANCELLED") }
        guard (try self.readActive()?.id ?? "legacy") == expected else { throw self.failure("VAULT_CONFLICT") }
        guard FileManager.default.fileExists(atPath: try self.databaseURL(id).path) else { throw self.failure("MISSING_DATABASE") }
        try self.writeActive(id)
        return true
      }
    }
    AsyncFunction("sealBackup") { (text: String, password: String) throws -> String in
      let plain = Data(text.utf8)
      guard plain.count <= 20000000 else { throw self.failure("BACKUP_TOO_LARGE") }
      let salt = try self.randomData(16)
      let key = try self.derive(password, salt: salt)
      let sealed = try AES.GCM.seal(plain, using: key, authenticating: self.aad)
      guard let combined = sealed.combined else { throw self.failure("ENCRYPTION_FAILED") }
      let envelope = Envelope(format: "la-espartana-backup", version: 1,
        cipher: "AES-256-GCM", kdf: "PBKDF2-HMAC-SHA256", iterations: self.iterations,
        salt: salt.base64EncodedString(), sealed: combined.base64EncodedString())
      return String(decoding: try JSONEncoder().encode(envelope), as: UTF8.self)
    }
    AsyncFunction("openBackup") { (text: String, password: String) throws -> String in
      guard text.utf8.count <= 28000000 else { throw self.failure("BACKUP_TOO_LARGE") }
      let envelope = try JSONDecoder().decode(Envelope.self, from: Data(text.utf8))
      guard envelope.format == "la-espartana-backup", envelope.version == 1,
        envelope.cipher == "AES-256-GCM", envelope.kdf == "PBKDF2-HMAC-SHA256",
        envelope.iterations == self.iterations,
        let salt = Data(base64Encoded: envelope.salt), salt.count == 16,
        let combined = Data(base64Encoded: envelope.sealed), combined.count >= 28,
        combined.count <= 20000028 else { throw self.failure("INVALID_BACKUP") }
      let key = try self.derive(password, salt: salt)
      let box = try AES.GCM.SealedBox(combined: combined)
      let plain = try AES.GCM.open(box, using: key, authenticating: self.aad)
      guard let result = String(data: plain, encoding: .utf8) else { throw self.failure("INVALID_BACKUP_TEXT") }
      return result
    }
  }
}
