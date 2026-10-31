import Foundation
import UIKit
import WebKit

@MainActor
private final class EspartanaPrintPageRenderer: UIPrintPageRenderer {
  let line: String
  init(_ line: String) { self.line = line; super.init(); footerHeight = 18 }
  override func drawFooterForPage(at pageIndex: Int, in footerRect: CGRect) {
    let text = line + " - " + String(pageIndex + 1)
    (text as NSString).draw(in: footerRect.insetBy(dx: 2, dy: 3), withAttributes: [
      .font: UIFont.systemFont(ofSize: 7), .foregroundColor: UIColor.darkGray
    ])
  }
}

// Preparación pendiente de compilación y validación en iPhone.
@MainActor
final class EspartanaPDFRenderer: NSObject, WKNavigationDelegate {
  private let webView: WKWebView
  private let label: String
  private let footer: String
  private var continuation: CheckedContinuation<String, Error>?
  private var timeout: Task<Void, Never>?
  private var backgroundObserver: NSObjectProtocol?
  private let startedAt = Date()

  private static func failure(_ code: String) -> NSError {
    NSError(domain: "EspartanaPDF", code: 1, userInfo: [NSLocalizedDescriptionKey: code])
  }

  static func directory() throws -> URL {
    guard let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { throw failure("REPORT_DIRECTORY") }
    var url = base.appendingPathComponent("EspartanaReports", isDirectory: true)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true,
      attributes: [.protectionKey: FileProtectionType.complete])
    try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: url.path)
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try url.setResourceValues(values)
    return url
  }

  static func remove(_ uri: String) throws -> Bool {
    guard let supplied = URL(string: uri), supplied.isFileURL else { throw failure("REPORT_PATH") }
    let url = supplied.standardizedFileURL.resolvingSymlinksInPath()
    let root = try directory().standardizedFileURL.resolvingSymlinksInPath().path + "/"
    guard url.path.hasPrefix(root), url.lastPathComponent.hasPrefix("La-Espartana-"), url.pathExtension == "pdf" else { throw failure("REPORT_PATH") }
    let attrs = try FileManager.default.attributesOfItem(atPath: url.path)
    guard attrs[.type] as? FileAttributeType == .typeRegular else { throw failure("REPORT_PATH") }
    try FileManager.default.removeItem(at: url)
    return true
  }

  static func render(_ html: String, label: String, footer: String) async throws -> String {
    guard html.utf8.count <= 12000000, label.utf8.count <= 80,
      label.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression)?.upperBound == label.endIndex else { throw failure("REPORT_LIMIT") }
    guard footer.utf8.count <= 512, !footer.contains("\n"), !footer.contains("\r"), !footer.contains("\0") else { throw failure("REPORT_LIMIT") }
    let job = EspartanaPDFRenderer(label: label, footer: footer)
    return try await job.run(html)
  }

  private init(label: String, footer: String) {
    self.label = label
    self.footer = footer
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .nonPersistent()
    configuration.defaultWebpagePreferences.allowsContentJavaScript = false
    self.webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 595.28, height: 841.89), configuration: configuration)
    super.init()
    webView.navigationDelegate = self
  }

  private func run(_ html: String) async throws -> String {
    guard UIApplication.shared.applicationState == .active else { throw Self.failure("REPORT_CANCELLED") }
    return try await withCheckedThrowingContinuation { handler in
      continuation = handler
      backgroundObserver = NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification,
        object: nil, queue: .main) { [weak self] _ in
        Task { @MainActor in self?.finish(.failure(Self.failure("REPORT_CANCELLED"))) }
      }
      timeout = Task { @MainActor [weak self] in
        try? await Task.sleep(nanoseconds: 20000000000)
        if !Task.isCancelled { self?.finish(.failure(Self.failure("REPORT_TIMEOUT"))) }
      }
      let rules = #"[{"trigger":{"url-filter":"^(https?|wss?|ftp|file):"},"action":{"type":"block"}}]"#
      WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "EspartanaReportOffline-v1", encodedContentRuleList: rules) { [weak self] list, _ in
        Task { @MainActor in
          guard let self = self, self.continuation != nil else { return }
          guard let list = list, UIApplication.shared.applicationState == .active else {
            self.finish(.failure(Self.failure("REPORT_RENDER_FAILED")))
            return
          }
          self.webView.configuration.userContentController.add(list)
          self.webView.loadHTMLString(html, baseURL: nil)
        }
      }
    }
  }

  private func finish(_ result: Result<String, Error>) {
    guard let handler = continuation else { return }
    continuation = nil
    timeout?.cancel()
    if let observer = backgroundObserver { NotificationCenter.default.removeObserver(observer) }
    backgroundObserver = nil
    webView.stopLoading()
    webView.navigationDelegate = nil
    handler.resume(with: result)
  }

  func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    // Solo el documento local cargado por la app; no abrir enlaces ni marcos externos.
    let url = navigationAction.request.url
    decisionHandler(url == nil || url?.absoluteString == "about:blank" ? .allow : .cancel)
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    guard continuation != nil else { return }
    do {
      guard UIApplication.shared.applicationState == .active else { throw Self.failure("REPORT_CANCELLED") }
      webView.layoutIfNeeded()
      let renderer = EspartanaPrintPageRenderer(footer)
      renderer.addPrintFormatter(webView.viewPrintFormatter(), startingAtPageAt: 0)
      let paper = CGRect(x: 0, y: 0, width: 595.28, height: 841.89)
      renderer.setValue(paper, forKey: "paperRect")
      renderer.setValue(paper.insetBy(dx: 28, dy: 32), forKey: "printableRect")
      renderer.prepare(forDrawingPages: NSRange(location: 0, length: renderer.numberOfPages))
      let count = renderer.numberOfPages
      guard count > 0, count <= 70 else { throw Self.failure("REPORT_LIMIT") }
      let buffer = NSMutableData()
      UIGraphicsBeginPDFContextToData(buffer, paper, nil)
      var contextOpen = true
      defer { if contextOpen { UIGraphicsEndPDFContext() } }
      for page in 0..<count {
        guard UIApplication.shared.applicationState == .active, buffer.length <= 25000000,
          Date().timeIntervalSince(startedAt) < 20 else { throw Self.failure("REPORT_LIMIT") }
        UIGraphicsBeginPDFPageWithInfo(paper, nil)
        renderer.drawPage(at: page, in: paper)
      }
      // Terminar el contexto antes de escribir: se necesita el índice final del PDF.
      UIGraphicsEndPDFContext()
      contextOpen = false
      guard buffer.length <= 25000000 else { throw Self.failure("REPORT_LIMIT") }
      let url = try Self.directory().appendingPathComponent(label + "-" + UUID().uuidString + ".pdf")
      try (buffer as Data).write(to: url, options: [.atomic, .completeFileProtection])
      finish(.success(url.absoluteString))
    } catch { finish(.failure(error)) }
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    finish(.failure(Self.failure("REPORT_RENDER_FAILED")))
  }
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    finish(.failure(Self.failure("REPORT_RENDER_FAILED")))
  }
  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    finish(.failure(Self.failure("REPORT_RENDER_FAILED")))
  }
}
