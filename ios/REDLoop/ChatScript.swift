import Foundation
import CryptoKit

/// Where the in-app continuation script came from.
enum ChatScriptSource: String, Sendable {
    case cloud = "Cloudflare"
    case cache = "Zwischenspeicher"
    case bundle = "App"
}

struct ChatScript: Equatable, Sendable {
    let source: ChatScriptSource
    let version: String
    let body: String
}

enum ChatScriptError: LocalizedError {
    case missing, rejected, tooLarge

    var errorDescription: String? {
        switch self {
        case .missing: return "Das Loop-Skript wurde nicht gefunden."
        case .rejected: return "Die geladene Datei ist kein RED-Loop-Skript."
        case .tooLarge: return "Die geladene Datei ist zu groß für das Loop-Skript."
        }
    }
}

protocol ChatScriptTransferring {
    func data(from url: URL) async throws -> Data
}

struct ChatScriptTransfer: ChatScriptTransferring {
    func data(from url: URL) async throws -> Data {
        var request = URLRequest(url: url)
        request.timeoutInterval = 12
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("REDLoop-App", forHTTPHeaderField: "User-Agent")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { throw ChatScriptError.missing }
        return data
    }
}

/// Loads scripts only when their SHA-256 matches the copy bundled inside the
/// signed app. Changed remote versions require a trusted app update until a
/// separate cryptographically signed release channel is available.
struct ChatScriptLoader {
    static let path = "/red-loop-webview.js"
    static let resource = "red-loop-webview"
    static let maxBytes = 262_144
    private static let cacheName = "red-loop-webview.js"

    private let transfer: ChatScriptTransferring
    private let bundle: Bundle
    private let cacheDirectory: URL?
    private let server: String?

    init(transfer: ChatScriptTransferring = ChatScriptTransfer(),
         bundle: Bundle = .main,
         cacheDirectory: URL? = ChatScriptLoader.defaultCacheDirectory(),
         credentials: CloudCredentialStoring = KeychainCloudCredentials()) {
        self.transfer = transfer
        self.bundle = bundle
        self.cacheDirectory = cacheDirectory
        // The stored connection decides which private server publishes the
        // script. Its token is never sent: the script is a public asset.
        self.server = (try? credentials.load())?.serverURL ?? CloudConnection.defaultServer
    }

    init(transfer: ChatScriptTransferring, bundle: Bundle, cacheDirectory: URL?, server: String?) {
        self.transfer = transfer
        self.bundle = bundle
        self.cacheDirectory = cacheDirectory
        self.server = server
    }

    var serverAddress: String? { server }

    static func defaultCacheDirectory() -> URL? {
        try? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
    }

    /// Only HTTPS, and only the host of the configured private server.
    static func scriptURL(server: String?) -> URL? {
        guard let server, var parts = URLComponents(string: server), parts.scheme?.lowercased() == "https",
              let host = parts.host, !host.isEmpty else { return nil }
        parts.scheme = "https"
        while parts.path.hasSuffix("/") { parts.path.removeLast() }
        parts.path += path
        parts.query = nil
        parts.fragment = nil
        return parts.url
    }

    /// A structural check, complemented by SHA-256 trust validation in script().
    static func validate(_ data: Data) throws -> String {
        guard data.count <= maxBytes else { throw ChatScriptError.tooLarge }
        guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { throw ChatScriptError.rejected }
        let required = ["red-loop-root", "__RED_LOOP_HOST__", "rl-start", "rl-stop"]
        guard required.allSatisfy(text.contains),
              text.trimmingCharacters(in: .whitespacesAndNewlines).hasSuffix(")();") else { throw ChatScriptError.rejected }
        return text
    }

    /// The signed app bundle is the independent trust anchor. Hash pinning
    /// detects a modified script even if all markers and versions appear valid.
    static func trusted(_ candidate: String, bundled: String) -> Bool {
        Array(SHA256.hash(data: Data(candidate.utf8))) == Array(SHA256.hash(data: Data(bundled.utf8)))
    }

    static func version(in body: String) -> String {
        for line in body.split(separator: "\n", maxSplits: 24, omittingEmptySubsequences: true) {
            guard line.hasPrefix("// @version") else { continue }
            let value = line.dropFirst("// @version".count).trimmingCharacters(in: .whitespaces)
            if !value.isEmpty { return value }
        }
        return "unbekannt"
    }

    /// True when `candidate` is at least `reference`. An unreadable version
    /// counts as older, so a surprise never wins over what ships with the app.
    static func atLeast(_ candidate: String, _ reference: String) -> Bool {
        guard let left = numbers(candidate) else { return false }
        guard let right = numbers(reference) else { return true }
        for index in 0..<max(left.count, right.count) {
            let a = index < left.count ? left[index] : 0
            let b = index < right.count ? right[index] : 0
            if a != b { return a > b }
        }
        return true
    }

    private static func numbers(_ value: String) -> [Int]? {
        let parts = value.trimmingCharacters(in: .whitespaces).split(separator: ".", omittingEmptySubsequences: false)
        guard !parts.isEmpty else { return nil }
        var result: [Int] = []
        for part in parts {
            guard !part.isEmpty, part.allSatisfy(\.isNumber), let number = Int(part) else { return nil }
            result.append(number)
        }
        return result
    }

    /// Cloud copy, else the last good download, else the bundled copy — but
    /// never a copy older than the one shipped with the app. A server that was
    /// not redeployed must not quietly take features away.
    func script(allowCloud: Bool = true) async throws -> ChatScript {
        // With no bundled trust anchor, never execute downloaded or cached code.
        guard let bundledBody = bundled() else { throw ChatScriptError.missing }
        let floor = ChatScriptLoader.version(in: bundledBody)
        func acceptable(_ body: String) -> Bool {
            ChatScriptLoader.atLeast(ChatScriptLoader.version(in: body), floor)
                && ChatScriptLoader.trusted(body, bundled: bundledBody)
        }

        if allowCloud, let url = ChatScriptLoader.scriptURL(server: server) {
            do {
                let body = try ChatScriptLoader.validate(try await transfer.data(from: url))
                if acceptable(body) {
                    store(body)
                    return ChatScript(source: .cloud, version: ChatScriptLoader.version(in: body), body: body)
                }
            } catch { /* Untrusted or unavailable cloud script: use the pinned fallback. */ }
        }
        if let cached = cached(), acceptable(cached) {
            return ChatScript(source: .cache, version: ChatScriptLoader.version(in: cached), body: cached)
        }
        return ChatScript(source: .bundle, version: ChatScriptLoader.version(in: bundledBody), body: bundledBody)
    }

    /// Settings the script reads before it builds its panel. No credentials.
    static func hostPrologue(bottomInset: Int) -> String {
        let inset = max(0, min(240, bottomInset))
        return "window.__RED_LOOP_HOST__ = {app: 'ios-webview', bottomInset: \(inset)};\n"
    }

    private var cacheFile: URL? { cacheDirectory?.appendingPathComponent(ChatScriptLoader.cacheName) }

    private func store(_ body: String) {
        guard let cacheFile else { return }
        try? Data(body.utf8).write(to: cacheFile, options: .atomic)
    }

    private func cached() -> String? {
        guard let cacheFile, let data = try? Data(contentsOf: cacheFile) else { return nil }
        return try? ChatScriptLoader.validate(data)
    }

    private func bundled() -> String? {
        guard let url = bundle.url(forResource: ChatScriptLoader.resource, withExtension: "js"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? ChatScriptLoader.validate(data)
    }

    func clearCache() {
        guard let cacheFile else { return }
        try? FileManager.default.removeItem(at: cacheFile)
    }
}

/// The status the injected panel reports back. Counters only: no conversation
/// text and no follow-up text crosses the bridge.
struct ChatLoopState: Equatable, Sendable {
    var running = false
    var count = 0
    var limit = 10
    var endless = false
    var status = "Panel wird vorbereitet …"

    init() {}

    init?(message: Any) {
        guard let payload = message as? [String: Any], payload["type"] as? String == "state" else { return nil }
        running = payload["running"] as? Bool ?? false
        count = payload["count"] as? Int ?? 0
        limit = payload["limit"] as? Int ?? 10
        endless = payload["endless"] as? Bool ?? false
        let reported = (payload["status"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        status = reported.isEmpty ? "Bereit" : String(reported.prefix(160))
    }

    var progress: String { endless ? "\(count) / ∞" : "\(count) / \(limit)" }
}
