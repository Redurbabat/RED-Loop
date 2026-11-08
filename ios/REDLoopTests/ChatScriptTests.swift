import XCTest
@testable import REDLoop

private struct StubTransfer: ChatScriptTransferring {
    let result: Result<Data, Error>
    func data(from url: URL) async throws -> Data {
        StubTransfer.requested.withLock { $0.append(url) }
        return try result.get()
    }
    static let requested = Locked<[URL]>([])
}

/// Minimal lock so the stub can record calls from the transfer's context.
private final class Locked<Value>: @unchecked Sendable {
    private var value: Value
    private let lock = NSLock()
    init(_ value: Value) { self.value = value }
    func withLock<Result>(_ body: (inout Value) -> Result) -> Result {
        lock.lock(); defer { lock.unlock() }
        return body(&value)
    }
    var current: Value { withLock { $0 } }
}

private enum StubError: Error { case offline }

final class ChatScriptTests: XCTestCase {
    private var directory: URL!

    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        StubTransfer.requested.withLock { $0.removeAll() }
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: directory)
    }

    private func body(version: String = "0.4.0", marker: Bool = true) -> String {
        """
        // ==UserScript==
        // @version      \(version)
        // ==/UserScript==
        (() => {
          'use strict';
          const hostConfig = window.\(marker ? "__RED_LOOP_HOST__" : "__OTHER__");
          const root = 'red-loop-root';
          const controls = ['rl-start', 'rl-stop'];
          void hostConfig; void root; void controls;
        })();
        """
    }

    func testScriptURLRequiresHTTPSAndKeepsThePublishedPath() {
        XCTAssertEqual(ChatScriptLoader.scriptURL(server: "https://example.workers.dev")?.absoluteString,
                       "https://example.workers.dev/red-loop-webview.js")
        XCTAssertEqual(ChatScriptLoader.scriptURL(server: "https://example.workers.dev/")?.absoluteString,
                       "https://example.workers.dev/red-loop-webview.js")
        XCTAssertNil(ChatScriptLoader.scriptURL(server: "http://example.workers.dev"))
        XCTAssertNil(ChatScriptLoader.scriptURL(server: "not a url"))
        XCTAssertNil(ChatScriptLoader.scriptURL(server: nil))
    }

    func testValidationRejectsErrorPagesTruncatedDownloadsAndForeignScripts() {
        XCTAssertNoThrow(try ChatScriptLoader.validate(Data(body().utf8)))
        XCTAssertThrowsError(try ChatScriptLoader.validate(Data("<!doctype html><title>404</title>".utf8)))
        XCTAssertThrowsError(try ChatScriptLoader.validate(Data()))
        XCTAssertThrowsError(try ChatScriptLoader.validate(Data(body(marker: false).utf8)))
        XCTAssertThrowsError(try ChatScriptLoader.validate(Data(body().dropLast(20).utf8)))
        XCTAssertThrowsError(try ChatScriptLoader.validate(Data(count: ChatScriptLoader.maxBytes + 1)))
    }

    func testVersionIsReadFromTheUserScriptHeader() {
        XCTAssertEqual(ChatScriptLoader.version(in: body(version: "1.2.3")), "1.2.3")
        XCTAssertEqual(ChatScriptLoader.version(in: "(() => {})();"), "unbekannt")
    }

    func testCloudCopyIsPreferredAndCached() async throws {
        let loader = ChatScriptLoader(transfer: StubTransfer(result: .success(Data(body(version: "9.9.9").utf8))),
                                      bundle: .main, cacheDirectory: directory, server: "https://example.workers.dev")
        let script = try await loader.script()
        XCTAssertEqual(script.source, .cloud)
        XCTAssertEqual(script.version, "9.9.9")
        XCTAssertEqual(StubTransfer.requested.current.first?.absoluteString, "https://example.workers.dev/red-loop-webview.js")
        XCTAssertTrue(FileManager.default.fileExists(atPath: directory.appendingPathComponent("red-loop-webview.js").path))
    }

    func testAnOfflineServerFallsBackToTheCachedCopy() async throws {
        let good = ChatScriptLoader(transfer: StubTransfer(result: .success(Data(body(version: "2.0.0").utf8))),
                                    bundle: .main, cacheDirectory: directory, server: "https://example.workers.dev")
        _ = try await good.script()
        let offline = ChatScriptLoader(transfer: StubTransfer(result: .failure(StubError.offline)),
                                       bundle: .main, cacheDirectory: directory, server: "https://example.workers.dev")
        let script = try await offline.script()
        XCTAssertEqual(script.source, .cache)
        XCTAssertEqual(script.version, "2.0.0")
    }

    func testRejectedDownloadNeverReplacesTheCachedCopy() async throws {
        let good = ChatScriptLoader(transfer: StubTransfer(result: .success(Data(body(version: "3.0.0").utf8))),
                                    bundle: .main, cacheDirectory: directory, server: "https://example.workers.dev")
        _ = try await good.script()
        let broken = ChatScriptLoader(transfer: StubTransfer(result: .success(Data("<html>login</html>".utf8))),
                                      bundle: .main, cacheDirectory: directory, server: "https://example.workers.dev")
        let script = try await broken.script()
        XCTAssertEqual(script.source, .cache)
        XCTAssertEqual(script.version, "3.0.0")
    }

    func testDisabledCloudLoadingUsesTheBundledCopyAndNeverCallsTheServer() async throws {
        let loader = ChatScriptLoader(transfer: StubTransfer(result: .failure(StubError.offline)),
                                      bundle: .main, cacheDirectory: nil, server: "https://example.workers.dev")
        let script = try await loader.script(allowCloud: false)
        XCTAssertEqual(script.source, .bundle)
        XCTAssertFalse(script.body.isEmpty)
        XCTAssertTrue(script.body.contains("__RED_LOOP_HOST__"))
        XCTAssertTrue(StubTransfer.requested.current.isEmpty)
    }

    func testBundledCopyIsThePublishedContinuationScript() throws {
        let url = try XCTUnwrap(Bundle.main.url(forResource: ChatScriptLoader.resource, withExtension: "js"))
        let text = try ChatScriptLoader.validate(try Data(contentsOf: url))
        XCTAssertTrue(text.contains("chat.openai.com"), "the origin guard must ship with the app")
        XCTAssertTrue(text.contains("rl-endless"), "endless mode must ship with the app")
        XCTAssertNotEqual(ChatScriptLoader.version(in: text), "unbekannt")
    }

    func testHostPrologueAnnouncesTheAppAndClampsTheInset() {
        XCTAssertEqual(ChatScriptLoader.hostPrologue(bottomInset: 12),
                       "window.__RED_LOOP_HOST__ = {app: 'ios-webview', bottomInset: 12};\n")
        XCTAssertTrue(ChatScriptLoader.hostPrologue(bottomInset: -5).contains("bottomInset: 0"))
        XCTAssertTrue(ChatScriptLoader.hostPrologue(bottomInset: 9000).contains("bottomInset: 240"))
    }

    func testOnlyWellFormedPanelStateIsAccepted() {
        XCTAssertNil(ChatLoopState(message: "weiter"))
        XCTAssertNil(ChatLoopState(message: ["type": "command", "run": true]))
        let state = ChatLoopState(message: [
            "type": "state", "running": true, "count": 7, "limit": 10, "endless": true, "status": "Endlos aktiv · 7/∞"
        ] as [String: Any])
        XCTAssertEqual(state?.count, 7)
        XCTAssertEqual(state?.running, true)
        XCTAssertEqual(state?.progress, "7 / ∞")
        let bounded = ChatLoopState(message: ["type": "state", "status": String(repeating: "x", count: 500)])
        XCTAssertEqual(bounded?.status.count, 160)
        XCTAssertEqual(bounded?.progress, "0 / 10")
    }

    func testOnlyChatGPTOriginsMayReportPanelState() {
        XCTAssertTrue(ChatBridge.isChatHost("chatgpt.com"))
        XCTAssertTrue(ChatBridge.isChatHost("chat.openai.com"))
        XCTAssertFalse(ChatBridge.isChatHost("chatgpt.com.example.com"))
        XCTAssertFalse(ChatBridge.isChatHost(nil))
    }

    func testOnlyChatGPTAndItsSignInHostsStayInTheApp() {
        for host in ["chatgpt.com", "auth.openai.com", "accounts.google.com", "appleid.apple.com", "cdn.oaistatic.com"] {
            XCTAssertTrue(ChatBridge.staysInApp(host), host)
        }
        for host in ["example.com", "chatgpt.com.example.com", "openai.com.evil.test"] {
            XCTAssertFalse(ChatBridge.staysInApp(host), host)
        }
    }
}

final class ChatScriptVersionTests: XCTestCase {
    func testANewerOrEqualVersionIsAccepted() {
        XCTAssertTrue(ChatScriptLoader.atLeast("0.5.0", "0.5.0"))
        XCTAssertTrue(ChatScriptLoader.atLeast("0.5.1", "0.5.0"))
        XCTAssertTrue(ChatScriptLoader.atLeast("0.6", "0.5.9"))
        XCTAssertTrue(ChatScriptLoader.atLeast("1.0.0", "0.9.9"))
    }

    func testAnOlderServerCopyMustNotBeatTheOneShippedWithTheApp() {
        XCTAssertFalse(ChatScriptLoader.atLeast("0.4.0", "0.5.0"))
        XCTAssertFalse(ChatScriptLoader.atLeast("0.9.9", "1.0.0"))
    }

    func testAnUnreadableVersionCountsAsOlder() {
        XCTAssertFalse(ChatScriptLoader.atLeast("unbekannt", "0.5.0"))
        XCTAssertFalse(ChatScriptLoader.atLeast("", "0.5.0"))
        XCTAssertFalse(ChatScriptLoader.atLeast("0.5.x", "0.5.0"))
        XCTAssertTrue(ChatScriptLoader.atLeast("0.5.0", "unbekannt"))
    }
}
