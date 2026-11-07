import Foundation
import Security

struct CloudConnection: Codable, Equatable, Sendable {
    private enum CodingKeys: String, CodingKey { case serverURL, token }
    static let defaultServer = "https://red-loop.redurbabat7.workers.dev"
    let serverURL: String
    let token: String

    init(serverURL: String, token: String) throws {
        let address = serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard var parts = URLComponents(string: address), parts.scheme?.lowercased() == "https",
              let host = parts.host, !host.isEmpty, parts.user == nil, parts.password == nil,
              parts.query == nil, parts.fragment == nil else { throw CloudAPIError.invalidServer }
        let credential = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !credential.isEmpty, !token.contains("\n"), !token.contains("\r") else { throw CloudAPIError.missingToken }
        parts.scheme = "https"
        while parts.path.hasSuffix("/") { parts.path.removeLast() }
        guard let url = parts.url else { throw CloudAPIError.invalidServer }
        self.serverURL = url.absoluteString
        self.token = credential
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(serverURL: values.decode(String.self, forKey: .serverURL), token: values.decode(String.self, forKey: .token))
    }
}

protocol CloudCredentialStoring {
    func load() throws -> CloudConnection?
    func save(_ connection: CloudConnection) throws
    func remove() throws
}

struct KeychainCloudCredentials: CloudCredentialStoring {
    private let service = "com.bbtred.redloop.cloud"
    private let account = "server-connection"
    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
    }
    func load() throws -> CloudConnection? {
        var request = query
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw CloudAPIError.keychain }
        do { return try JSONDecoder().decode(CloudConnection.self, from: data) }
        catch { throw CloudAPIError.keychain }
    }
    func save(_ connection: CloudConnection) throws {
        let data = try JSONEncoder().encode(connection)
        let update: [String: Any] = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        let status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            var item = query
            update.forEach { item[$0.key] = $0.value }
            guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { throw CloudAPIError.keychain }
        } else if status != errSecSuccess { throw CloudAPIError.keychain }
    }
    func remove() throws {
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw CloudAPIError.keychain }
    }
}

enum CloudAPIError: LocalizedError, Equatable, Sendable {
    case invalidServer, missingToken, notConnected, keychain, invalidJob, invalidResponse, unauthorized, connection, timeout, busy
    case server(Int, String)
    var errorDescription: String? {
        switch self {
        case .invalidServer: return "Bitte eine gültige HTTPS-Serveradresse ohne Zugangsdaten, Suchparameter oder Fragment eingeben."
        case .missingToken: return "Bitte den Server-Zugangstoken eingeben."
        case .notConnected: return "Zuerst eine Serververbindung einrichten."
        case .keychain: return "Die Verbindung konnte nicht sicher im Schlüsselbund gelesen oder gespeichert werden."
        case .invalidJob: return "Titel (bis 120 Zeichen) und Auftrag (bis 20.000 Zeichen) ausfüllen; 1–50 Schritte und 1–480 Minuten wählen."
        case .busy: return "Eine Anfrage läuft bereits. Bitte kurz warten."
        case .invalidResponse: return "Der Server hat eine ungültige Antwort geliefert. Bitte Serveradresse und Version prüfen."
        case .unauthorized: return "Zugang verweigert. Bitte den Server-Zugangstoken prüfen."
        case .connection: return "Der Server ist nicht erreichbar. Verbindung und Serveradresse prüfen."
        case .timeout: return "Die Serveranfrage hat zu lange gedauert. Bitte erneut aktualisieren."
        case .server(let code, let message): return "Serverfehler \(code): \(message)"
        }
    }
}

struct CloudServiceStatus: Decodable, Equatable, Sendable {
    let service: String
    let version: String
    let provider: String
    let configured: Bool
    let capabilities: [String]
}

struct CloudJob: Codable, Identifiable, Equatable, Sendable {
    let id: String
    let title: String
    let prompt: String
    let status: String
    let createdAt: String
    let updatedAt: String
    let stepCount: Int
    let maxSteps: Int
    let maxDurationMinutes: Int
    let summary: String
    let error: String?
    var statusTitle: String {
        switch status {
        case "queued": return "In Warteschlange"
        case "running": return "In Arbeit"
        case "paused": return "Pausiert"
        case "completed": return "Abgeschlossen"
        case "needs_input": return "Rückfrage"
        case "stopped": return "Gestoppt"
        case "failed": return "Fehlgeschlagen"
        case "limit_reached": return "Limit erreicht"
        default: return status
        }
    }
    var canPause: Bool { ["queued", "running"].contains(status) }
    var canResume: Bool { ["paused", "needs_input"].contains(status) }
    var canStop: Bool { ["queued", "running", "paused", "needs_input"].contains(status) }
}

struct CloudStep: Decodable, Identifiable, Equatable, Sendable {
    let index: Int
    let createdAt: String
    let summary: String
    let output: String
    let status: String
    var id: Int { index }
}

struct CloudArtifact: Decodable, Identifiable, Equatable, Sendable {
    let name: String
    let content: String?
    var id: String { name }
}

struct CloudJobDetail: Decodable, Equatable, Sendable {
    let job: CloudJob
    let steps: [CloudStep]
    let artifacts: [CloudArtifact]
    var exportText: String {
        var sections = ["# \(job.title)", "Status: \(job.statusTitle) · \(job.stepCount)/\(job.maxSteps) Schritte", "## Auftrag\n\(job.prompt)", "## Ergebnis\n\(job.summary)"]
        if let error = job.error { sections.append("## Serverhinweis\n\(error)") }
        for step in steps { sections.append("## Schritt \(step.index): \(step.summary)\n\(step.output)") }
        for artifact in artifacts { sections.append("## Artefakt: \(artifact.name)\n\(artifact.content ?? "In der App abrufbar.")") }
        return sections.joined(separator: "\n\n")
    }
}

struct CloudJobDraft: Encodable, Equatable, Sendable {
    let title: String
    let prompt: String
    let maxSteps: Int
    let maxDurationMinutes: Int
    var isValid: Bool { !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && title.utf16.count <= 120 && !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && prompt.utf16.count <= 20000 && (1...50).contains(maxSteps) && (1...480).contains(maxDurationMinutes) }
}

enum CloudJobAction: String, Sendable { case pause, resume, stop }

final class CloudRedirectPolicy: NSObject, URLSessionTaskDelegate {
    static func allows(from original: URL, to destination: URL) -> Bool {
        original.scheme?.lowercased() == "https" && destination.scheme?.lowercased() == "https" &&
        original.host?.lowercased() == destination.host?.lowercased() && (original.port ?? 443) == (destination.port ?? 443)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        guard let original = task.originalRequest?.url, let destination = request.url,
              Self.allows(from: original, to: destination) else { completionHandler(nil); return }
        completionHandler(request)
    }
}

final class CloudAPIClient: Sendable {
    private let connection: CloudConnection
    private let session: URLSession
    private struct JobsEnvelope: Decodable { let jobs: [CloudJob] }
    private struct JobEnvelope: Decodable { let job: CloudJob }

    init(connection: CloudConnection, session: URLSession? = nil) {
        self.connection = connection
        if let session = session { self.session = session }
        else {
            let config = URLSessionConfiguration.ephemeral
            config.httpShouldSetCookies = false; config.httpCookieStorage = nil; config.urlCache = nil
            config.requestCachePolicy = .reloadIgnoringLocalCacheData
            self.session = URLSession(configuration: config, delegate: CloudRedirectPolicy(), delegateQueue: nil)
        }
    }
    func status() async throws -> CloudServiceStatus { try await json("GET", ["status"]) }
    func jobs() async throws -> [CloudJob] { let result: JobsEnvelope = try await json("GET", ["jobs"]); return result.jobs }
    func detail(id: String) async throws -> CloudJobDetail { try await json("GET", ["jobs", id]) }
    func create(_ draft: CloudJobDraft, idempotencyKey: UUID) async throws -> CloudJob {
        guard draft.isValid else { throw CloudAPIError.invalidJob }
        let result: JobEnvelope = try await json("POST", ["jobs"], body: JSONEncoder().encode(draft), idempotencyKey: idempotencyKey.uuidString)
        return result.job
    }
    func control(id: String, action: CloudJobAction) async throws -> CloudJob {
        let result: JobEnvelope = try await json("POST", ["jobs", id, action.rawValue]); return result.job
    }
    func artifact(id: String, name: String) async throws -> String {
        let data = try await send("GET", ["jobs", id, "artifacts", name])
        guard let text = String(data: data, encoding: .utf8) else { throw CloudAPIError.invalidResponse }
        return text
    }
    private func json<T: Decodable>(_ method: String, _ segments: [String], body: Data? = nil, idempotencyKey: String? = nil) async throws -> T {
        let data = try await send(method, segments, body: body, idempotencyKey: idempotencyKey)
        do { return try JSONDecoder().decode(T.self, from: data) }
        catch { throw CloudAPIError.invalidResponse }
    }
    private func send(_ method: String, _ segments: [String], body: Data? = nil, idempotencyKey: String? = nil) async throws -> Data {
        guard var parts = URLComponents(string: connection.serverURL) else { throw CloudAPIError.invalidServer }
        let allowed = CharacterSet.urlPathAllowed.subtracting(CharacterSet(charactersIn: "/\\?#%"))
        guard segments.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." && !$0.contains("/") && !$0.contains("\\") }) else { throw CloudAPIError.invalidResponse }
        let path = (["api", "v1"] + segments).compactMap { $0.addingPercentEncoding(withAllowedCharacters: allowed) }.joined(separator: "/")
        parts.percentEncodedPath += "/" + path
        guard let url = parts.url else { throw CloudAPIError.invalidServer }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30)
        request.httpMethod = method; request.httpBody = body; request.httpShouldHandleCookies = false
        request.setValue("Bearer \(connection.token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json, text/plain", forHTTPHeaderField: "Accept")
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        if let key = idempotencyKey { request.setValue(key, forHTTPHeaderField: "Idempotency-Key") }
        let data: Data; let response: URLResponse
        do { (data, response) = try await session.data(for: request) }
        catch is CancellationError { throw CancellationError() }
        catch let error as URLError {
            if error.code == .cancelled { throw CancellationError() }
            throw (error.code == .timedOut ? CloudAPIError.timeout : CloudAPIError.connection)
        }
        catch { throw CloudAPIError.connection }
        guard let http = response as? HTTPURLResponse, let responseURL = http.url, CloudRedirectPolicy.allows(from: url, to: responseURL) else { throw CloudAPIError.invalidResponse }
        if http.statusCode == 401 || http.statusCode == 403 { throw CloudAPIError.unauthorized }
        guard (200...299).contains(http.statusCode) else {
            let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            let message = object?["message"] as? String ?? object?["error"] as? String ?? (object?["error"] as? [String: Any])?["message"] as? String ?? HTTPURLResponse.localizedString(forStatusCode: http.statusCode)
            throw CloudAPIError.server(http.statusCode, String(message.prefix(2000)))
        }
        return data
    }
}
