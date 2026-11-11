import Foundation
import CryptoKit
import CoreFoundation

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
        // Reject even successful cross-host redirects before any script reaches a WKWebView.
        guard let http = response as? HTTPURLResponse, http.statusCode == 200,
              http.url?.absoluteString == url.absoluteString,
              data.count <= ChatScriptLoader.maxBytes else { throw ChatScriptError.missing }
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
    private static let signedCacheName = "red-loop-signed-pair.json"
    private static let counterName = "red-loop-signed-counter.json"

    private let transfer: ChatScriptTransferring
    private let bundle: Bundle
    private let cacheDirectory: URL?
    private let server: String?
    private let trustedPublicKey: String?

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
        self.trustedPublicKey = ChatScriptLoader.publicKey(in: bundle)
    }

    init(transfer: ChatScriptTransferring, bundle: Bundle, cacheDirectory: URL?, server: String?,
         trustedPublicKey: String? = nil) {
        self.transfer = transfer
        self.bundle = bundle
        self.cacheDirectory = cacheDirectory
        self.server = server
        self.trustedPublicKey = trustedPublicKey ?? ChatScriptLoader.publicKey(in: bundle)
    }

    private static func publicKey(in bundle: Bundle) -> String? {
        guard let url = bundle.url(forResource: "release-public", withExtension: "pem"),
              let contents = try? String(contentsOf: url, encoding: .utf8),
              !contents.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return contents
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

    /// The manifest is resolved beside the script on the same HTTPS origin.
    static func manifestURL(server: String?) -> URL? {
        guard let script = scriptURL(server: server),
              var parts = URLComponents(url: script, resolvingAgainstBaseURL: false),
              parts.path.hasSuffix(path) else { return nil }
        parts.path = String(parts.path.dropLast(path.count)) + "/red-loop-webview.manifest.json"
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

        if let trustedPublicKey,
           let signed = await signedScript(allowCloud: allowCloud, publicKey: trustedPublicKey,
                                           bundledVersion: floor) {
            return signed
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


    private var signedCacheFile: URL? { cacheDirectory?.appendingPathComponent(ChatScriptLoader.signedCacheName) }
    private var sequenceFile: URL? { cacheDirectory?.appendingPathComponent(ChatScriptLoader.counterName) }

    private func keyFingerprint(_ key: String) -> String {
        SHA256.hash(data: Data(key.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    /// A malformed persisted counter never resets silently. A new key identity
    /// can only arrive through an updated, signed iOS app.
    private func minimumSequence(for fingerprint: String) -> Int? {
        guard let sequenceFile else { return nil }
        guard FileManager.default.fileExists(atPath: sequenceFile.path) else { return 1 }
        guard let data = try? Data(contentsOf: sequenceFile),
              let record = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let storedKey = record["key"] as? String, let value = record["sequence"] as? Int,
              value >= 1, value <= SignedScriptReleaseVerifier.maxSequence else { return nil }
        return storedKey == fingerprint ? value : 1
    }

    private func persistSequence(_ sequence: Int, fingerprint: String) -> Bool {
        guard let sequenceFile else { return false }
        do {
            let bytes = try JSONSerialization.data(withJSONObject: ["key":fingerprint,"sequence":sequence])
            try bytes.write(to: sequenceFile, options: .atomic)
            return true
        } catch { return false }
    }

    private func cacheSigned(script: Data, manifest: Data) {
        guard let signedCacheFile else { return }
        let record: [String: String] = [
            "script": script.base64EncodedString(), "manifest": manifest.base64EncodedString()
        ]
        guard let bytes = try? JSONSerialization.data(withJSONObject: record), bytes.count <= 500_000 else { return }
        try? bytes.write(to: signedCacheFile, options: .atomic)
    }

    private func readSignedCache() -> (Data, Data)? {
        guard let signedCacheFile,
              let attrs = try? FileManager.default.attributesOfItem(atPath: signedCacheFile.path),
              let size = attrs[.size] as? NSNumber, size.intValue <= 500_000,
              let data = try? Data(contentsOf: signedCacheFile),
              let record = try? JSONSerialization.jsonObject(with: data) as? [String: String],
              let script = record["script"].flatMap { Data(base64Encoded: $0) },
              let manifest = record["manifest"].flatMap { Data(base64Encoded: $0) },
              script.count <= ChatScriptLoader.maxBytes,
              manifest.count <= SignedScriptReleaseVerifier.maxManifestBytes else { return nil }
        return (script, manifest)
    }

    private func signedScript(allowCloud: Bool, publicKey: String, bundledVersion: String) async -> ChatScript? {
        let fingerprint = keyFingerprint(publicKey)
        guard let floor = minimumSequence(for: fingerprint) else { return nil }
        func verified(script: Data, manifest: Data) -> (String, Int)? {
            guard SignedScriptReleaseVerifier.verify(script: script, manifest: manifest,
                  publicKeyPEM: publicKey, minimumSequence: floor, minimumVersion: bundledVersion),
                  let body = try? ChatScriptLoader.validate(script),
                  let object = try? JSONSerialization.jsonObject(with: manifest) as? [String: Any],
                  let sequence = object["sequence"] as? Int else { return nil }
            return (body,sequence)
        }
        if allowCloud, let manifestURL = ChatScriptLoader.manifestURL(server: server),
           let scriptURL = ChatScriptLoader.scriptURL(server: server) {
            // A signed manifest binds the exact script bytes and its version.
            if let manifest = try? await transfer.data(from: manifestURL),
               manifest.count <= SignedScriptReleaseVerifier.maxManifestBytes,
               let downloaded = try? await transfer.data(from: scriptURL),
               let (body, sequence) = verified(script: downloaded, manifest: manifest),
               persistSequence(sequence, fingerprint: fingerprint) {
                cacheSigned(script: downloaded, manifest: manifest)
                return ChatScript(source: .cloud, version: ChatScriptLoader.version(in: body), body: body)
            }
        }
        if let (script, manifest) = readSignedCache(),
           let (body, _) = verified(script: script, manifest: manifest) {
            return ChatScript(source: .cache, version: ChatScriptLoader.version(in: body), body: body)
        }
        return nil
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
        if let cacheFile { try? FileManager.default.removeItem(at: cacheFile) }
        if let signedCacheFile { try? FileManager.default.removeItem(at: signedCacheFile) }
        // Deliberately retain the high-water sequence. Clearing a cache must
        // not permit rollback to a previously revoked signed script.
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


/// Verifies the canonical P-256 release manifest produced by scripts/signed-script.mjs.
/// This does NOT enable remote updates: only a public key embedded in a signed
/// app build is trusted, and the caller must durably enforce minimumSequence.
enum SignedScriptReleaseVerifier {
    static let format = "red-loop-script-v1"
    static let maxManifestBytes = 4096
    static let maxSequence = 2_147_483_647

    private static func versionParts(_ value: String) -> [Int]? {
        let parts = value.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 3 else { return nil }
        var result: [Int] = []
        for part in parts {
            let octets = Array(part.utf8)
            guard !octets.isEmpty, octets.count <= 9,
                  octets.allSatisfy({ (48...57).contains($0) }),
                  (octets.count == 1 || octets[0] != 48),
                  let parsed = Int(part) else { return nil }
            result.append(parsed)
        }
        return result
    }

    static func verify(script: Data, manifest: Data, publicKeyPEM: String?,
                       minimumSequence: Int = 1, minimumVersion: String = "0.0.0") -> Bool {
        guard let keyText = publicKeyPEM, !keyText.isEmpty,
              (1...maxSequence).contains(minimumSequence),
              manifest.count > 0, manifest.count <= maxManifestBytes,
              let minimumParts = versionParts(minimumVersion),
              let body = try? ChatScriptLoader.validate(script),
              let object = try? JSONSerialization.jsonObject(with: manifest) as? [String: Any],
              Set(object.keys) == Set(["format", "version", "sequence", "sha256", "signature"]),
              object["format"] as? String == format,
              let version = object["version"] as? String,
              let parts = versionParts(version), !parts.lexicographicallyPrecedes(minimumParts),
              ChatScriptLoader.version(in: body) == version,
              let sequenceNumber = object["sequence"] as? NSNumber,
              CFGetTypeID(sequenceNumber) != CFBooleanGetTypeID(),
              sequenceNumber.doubleValue == Double(sequenceNumber.int64Value),
              (minimumSequence...maxSequence).contains(sequenceNumber.intValue),
              let digest = object["sha256"] as? String,
              digest.utf8.count == 64,
              digest.utf8.allSatisfy({ (48...57).contains($0) || (97...102).contains($0) }),
              let signatureText = object["signature"] as? String,
              signatureText.utf8.count <= 160,
              let signatureData = Data(base64Encoded: signatureText),
              (64...80).contains(signatureData.count),
              signatureData.base64EncodedString() == signatureText else { return false }

        let computed = SHA256.hash(data: script).map { String(format: "%02x", $0) }.joined()
        guard computed == digest else { return false }
        let canonical = "RED_LOOP_SCRIPT_V1\n\(version)\n\(sequenceNumber.intValue)\n\(digest)\n"
        guard let key = try? P256.Signing.PublicKey(pemRepresentation: keyText),
              let signature = try? P256.Signing.ECDSASignature(derRepresentation: signatureData) else { return false }
        return key.isValidSignature(signature, for: Data(canonical.utf8))
    }
}
