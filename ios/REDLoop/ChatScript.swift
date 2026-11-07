import Foundation

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

/// Loads the continuation script for the in-app ChatGPT view. The published
/// Worker copy wins, so a ChatGPT layout change can be fixed with a deploy
/// instead of a new build; the cached and bundled copies keep the view usable
/// offline. The script is injected into a page where the user is signed in to
/// ChatGPT, so only HTTPS and only the configured private server are accepted.
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

    /// A content check, not a trust check: it rejects error pages and truncated
    /// downloads. Trust rests on HTTPS to the owner's own Worker.
    static func validate(_ data: Data) throws -> String {
        guard data.count <= maxBytes else { throw ChatScriptError.tooLarge }
        guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { throw ChatScriptError.rejected }
        let required = ["red-loop-root", "__RED_LOOP_HOST__", "rl-start", "rl-stop"]
        guard required.allSatisfy(text.contains),
              text.trimmingCharacters(in: .whitespacesAndNewlines).hasSuffix(")();") else { throw ChatScriptError.rejected }
        return text
    }

    static func version(in body: String) -> String {
        for line in body.split(separator: "\n", maxSplits: 24, omittingEmptySubsequences: true) {
            guard line.hasPrefix("// @version") else { continue }
            let value = line.dropFirst("// @version".count).trimmingCharacters(in: .whitespaces)
            if !value.isEmpty { return value }
        }
        return "unbekannt"
    }

    /// Cloud copy, else the last good download, else the bundled copy.
    func script(allowCloud: Bool = true) async throws -> ChatScript {
        var failure: Error?
        if allowCloud, let url = ChatScriptLoader.scriptURL(server: server) {
            do {
                let body = try ChatScriptLoader.validate(try await transfer.data(from: url))
                store(body)
                return ChatScript(source: .cloud, version: ChatScriptLoader.version(in: body), body: body)
            } catch { failure = error }
        }
        if let cached = cached() {
            return ChatScript(source: .cache, version: ChatScriptLoader.version(in: cached), body: cached)
        }
        if let bundled = bundled() {
            return ChatScript(source: .bundle, version: ChatScriptLoader.version(in: bundled), body: bundled)
        }
        throw failure ?? ChatScriptError.missing
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
