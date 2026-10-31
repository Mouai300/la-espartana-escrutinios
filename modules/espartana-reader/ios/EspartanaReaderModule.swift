import ExpoModulesCore
import PDFKit
import Vision
import ImageIO
import Foundation

public class EspartanaReaderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("EspartanaReader")
    AsyncFunction("discardCachedDocument") { (uri: String) throws -> Bool in
      let url = try Self.cachedURL(uri)
      let attrs = try FileManager.default.attributesOfItem(atPath: url.path)
      guard attrs[.type] as? FileAttributeType == .typeRegular else { throw Self.failure("DOCUMENT_UNREADABLE") }
      try FileManager.default.removeItem(at: url)
      return true
    }
    AsyncFunction("reviewCachedDocument") { (uri: String, kind: String) throws -> [String: Any] in
      let url = try Self.cachedURL(uri)
      let attrs = try FileManager.default.attributesOfItem(atPath: url.path)
      guard attrs[.type] as? FileAttributeType == .typeRegular else { throw Self.failure("DOCUMENT_UNREADABLE") }
      defer { try? FileManager.default.removeItem(at: url) }
      try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: url.path)
      guard let size = attrs[.size] as? NSNumber, size.intValue > 0, size.intValue <= 25 * 1024 * 1024 else {
        throw Self.failure("DOCUMENT_LIMIT")
      }
      if kind == "pdf" { return try Self.securePDF(url) }
      if kind == "photo" { return try Self.securePhoto(url) }
      throw Self.failure("DOCUMENT_UNREADABLE")
    }
    AsyncFunction("recognizePhoto") { (uri: String) throws -> [[String: Any]] in
      guard let url = URL(string: uri), url.isFileURL else {
        throw NSError(domain: "EspartanaReader", code: 10, userInfo: [NSLocalizedDescriptionKey: "Selecciona una imagen local."])
      }
      let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
      guard size <= 25 * 1024 * 1024, let source = CGImageSourceCreateWithURL(url as CFURL, nil) else {
        throw NSError(domain: "EspartanaReader", code: 11, userInfo: [NSLocalizedDescriptionKey: "Imagen no válida o superior a 25 MB."])
      }
      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
      let orientationValue = (properties?[kCGImagePropertyOrientation] as? NSNumber)?.uint32Value ?? 1
      let orientation = CGImagePropertyOrientation(rawValue: orientationValue) ?? .up
      let request = VNRecognizeTextRequest()
      request.recognitionLevel = .accurate
      request.recognitionLanguages = ["es-ES", "en-US"]
      request.usesLanguageCorrection = false
      let handler = VNImageRequestHandler(url: url, orientation: orientation, options: [:])
      try handler.perform([request])
      return (request.results ?? []).compactMap { observation in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        let box = observation.boundingBox
        return ["text": candidate.string, "confidence": Double(candidate.confidence), "x": Double(box.minX), "y": Double(box.midY), "height": Double(box.height)]
      }
    }
    AsyncFunction("extractPDF") { (uri: String) throws -> [[String: String]] in
      guard let url = URL(string: uri), url.isFileURL else {
        throw NSError(domain: "EspartanaReader", code: 1, userInfo: [NSLocalizedDescriptionKey: "Selecciona un PDF local."])
      }
      let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
      guard size <= 25 * 1024 * 1024 else {
        throw NSError(domain: "EspartanaReader", code: 2, userInfo: [NSLocalizedDescriptionKey: "El PDF supera 25 MB."])
      }
      guard let document = PDFDocument(url: url), !document.isLocked, document.pageCount > 0, document.pageCount <= 50 else {
        throw NSError(domain: "EspartanaReader", code: 3, userInfo: [NSLocalizedDescriptionKey: "PDF protegido, no válido o con más de 50 páginas."])
      }
      return try (0..<document.pageCount).map { index in
        guard let page = document.page(at: index) else {
          throw NSError(domain: "EspartanaReader", code: 4, userInfo: [NSLocalizedDescriptionKey: "No se puede leer una página."])
        }
        let plain = page.string ?? ""
        return ["plain": plain, "layout": try Self.layout(page, text: plain)]
      }
    }
  }

  private static func failure(_ code: String) -> NSError {
    NSError(domain: "EspartanaReader", code: 20, userInfo: [NSLocalizedDescriptionKey: code])
  }

  private static func cachedURL(_ uri: String) throws -> URL {
    guard let supplied = URL(string: uri), supplied.isFileURL,
      let cache = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else {
      throw failure("DOCUMENT_UNREADABLE")
    }
    let url = supplied.standardizedFileURL.resolvingSymlinksInPath()
    let root = cache.standardizedFileURL.resolvingSymlinksInPath().path + "/"
    guard url.path.hasPrefix(root) else { throw failure("DOCUMENT_NOT_CACHED") }
    return url
  }

  private static func previewJPEG(_ image: CGImage) throws -> String {
    let data = NSMutableData()
    guard let destination = CGImageDestinationCreateWithData(data, "public.jpeg" as CFString, 1, nil) else { throw failure("DOCUMENT_UNREADABLE") }
    CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: 0.6] as CFDictionary)
    guard CGImageDestinationFinalize(destination), data.length <= 1300000 else { throw failure("DOCUMENT_LIMIT") }
    return "data:image/jpeg;base64," + (data as Data).base64EncodedString()
  }

  private static func securePhoto(_ url: URL) throws -> [String: Any] {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary),
      let rawType = CGImageSourceGetType(source),
      ["public.jpeg", "public.png", "public.heic", "public.heif"].contains(rawType as String),
      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
      let width = properties[kCGImagePropertyPixelWidth] as? NSNumber,
      let height = properties[kCGImagePropertyPixelHeight] as? NSNumber,
      width.doubleValue > 0, height.doubleValue > 0,
      width.doubleValue * height.doubleValue <= 32000000 else { throw failure("DOCUMENT_LIMIT") }
    func thumbnail(_ maximum: Int) -> CGImage? {
      CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: maximum,
        kCGImageSourceShouldCacheImmediately: true] as CFDictionary)
    }
    guard let image = thumbnail(3200), let small = thumbnail(900) else { throw failure("DOCUMENT_UNREADABLE") }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["es-ES", "en-US"]
    request.usesLanguageCorrection = false
    try VNImageRequestHandler(cgImage: image, orientation: .up, options: [:]).perform([request])
    let results = request.results ?? []
    guard results.count <= 1500 else { throw failure("DOCUMENT_LIMIT") }
    var total = 0
    let observations: [[String: Any]] = try results.compactMap { observation in
      guard let candidate = observation.topCandidates(1).first else { return nil }
      total += candidate.string.utf16.count
      guard candidate.string.utf16.count <= 2000, total <= 100000 else { throw failure("DOCUMENT_LIMIT") }
      let box = observation.boundingBox
      return ["text": candidate.string, "confidence": Double(candidate.confidence), "x": Double(box.minX), "y": Double(box.midY), "height": Double(box.height)]
    }
    return ["observations": observations, "preview": try previewJPEG(small)]
  }

  private static func securePDF(_ url: URL) throws -> [String: Any] {
    guard let document = PDFDocument(url: url), !document.isLocked, document.pageCount > 0, document.pageCount <= 50 else { throw failure("DOCUMENT_UNREADABLE") }
    var pages: [[String: String]] = [], total = 0
    var preview: String?
    for index in 0..<document.pageCount {
      guard let page = document.page(at: index), page.numberOfCharacters <= 100000 else { throw failure("DOCUMENT_LIMIT") }
      let bounds = page.bounds(for: .mediaBox)
      guard bounds.width.isFinite, bounds.height.isFinite, bounds.width > 0, bounds.height > 0,
        bounds.width <= 20000, bounds.height <= 20000 else { throw failure("DOCUMENT_LIMIT") }
      let plain = page.string ?? ""
      guard plain.utf16.count <= 100000 else { throw failure("DOCUMENT_LIMIT") }
      let text = try layout(page, text: plain)
      total += plain.utf16.count + text.utf16.count
      guard total <= 2000000 else { throw failure("DOCUMENT_LIMIT") }
      pages.append(["plain": plain, "layout": text])
      if index == 0, let image = page.thumbnail(of: CGSize(width: 900, height: 1200), for: .mediaBox).cgImage {
        preview = try previewJPEG(image)
      }
    }
    var output: [String: Any] = ["pages": pages]
    output["preview"] = preview.map { $0 as Any } ?? NSNull()
    return output
  }

  private struct Glyph {
    let text: String
    let bounds: CGRect
  }

  // Reconstruye espacios por posición para conservar los bloques de X15.
  private static func layout(_ page: PDFPage, text: String) throws -> String {
    let nsText = text as NSString
    let count = max(0, min(page.numberOfCharacters, nsText.length))
    guard count <= 100000 else { throw failure("DOCUMENT_LIMIT") }
    var glyphs: [Glyph] = []
    for index in 0..<count {
      let value = nsText.substring(with: NSRange(location: index, length: 1))
      let bounds = page.characterBounds(at: index)
      if !bounds.minX.isFinite || !bounds.maxX.isFinite || !bounds.midY.isFinite || !bounds.width.isFinite || !bounds.height.isFinite { continue }
      if value == "_" || value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || bounds.isEmpty || bounds.isInfinite || bounds.isNull { continue }
      glyphs.append(Glyph(text: value, bounds: bounds))
    }
    glyphs.sort { $0.bounds.midY == $1.bounds.midY ? $0.bounds.minX < $1.bounds.minX : $0.bounds.midY > $1.bounds.midY }
    var lines: [[Glyph]] = []
    for glyph in glyphs {
      if let last = lines.last, let first = last.first, abs(first.bounds.midY - glyph.bounds.midY) < 2 {
        lines[lines.count - 1].append(glyph)
      } else { lines.append([glyph]) }
    }
    var units = 0
    return try lines.map { line in
      let sorted = line.sorted { $0.bounds.minX < $1.bounds.minX }
      let widths = sorted.map { $0.bounds.width }.filter { $0 > 0 }.sorted()
      let unit = max(1, widths[widths.count / 2])
      var output = ""
      var right: CGFloat? = nil
      for glyph in sorted {
        if let previous = right {
          let distance = ((glyph.bounds.minX - previous) / unit).rounded()
          guard distance.isFinite else { throw failure("DOCUMENT_LIMIT") }
          let spaces = Int(min(120, max(0, distance)))
          units += spaces
          guard units <= 1000000 else { throw failure("DOCUMENT_LIMIT") }
          output += String(repeating: " ", count: spaces)
        }
        output += glyph.text
        units += glyph.text.utf16.count + 1
        guard units <= 1000000 else { throw failure("DOCUMENT_LIMIT") }
        right = glyph.bounds.maxX
      }
      return output
    }.joined(separator: "\n")
  }
}
