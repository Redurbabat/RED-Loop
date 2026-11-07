import XCTest
import Foundation
@testable import REDLoop

private final class CloudURLProtocol: URLProtocol, @unchecked Sendable {
    typealias Handler = (URLRequest) throws -> (Int, Data)
    private final class State: @unchecked Sendable {
        let lock = NSLock()
        var handler: Handler?
        var requests: [URLRequest] = []
    }
    private static let state = State()
    static func install(_ handler: @escaping Handler) {
        state.lock.lock(); defer { state.lock.unlock() }
        state.handler = handler; state.requests = []
    }
    static var requests: [URLRequest] {
        state.lock.lock(); defer { state.lock.unlock() }; return state.requests
    }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.state.lock.lock(); Self.state.requests.append(request); let handler = Self.state.handler; Self.state.lock.unlock()
        do {
            guard let handler = handler, let url = request.url else { throw URLError(.badURL) }
            let (status, data) = try handler(request)
            guard let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"]) else { throw URLError(.badServerResponse) }
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() { }
}

private final class MemoryCloudCredentials: CloudCredentialStoring {
    var connection: CloudConnection?
    func load() throws -> CloudConnection? { connection }
    func save(_ connection: CloudConnection) throws { self.connection = connection }
    func remove() throws { connection = nil }
}

final class CloudAPITests: XCTestCase {
    private static func job(status: String = "running") -> [String: Any] {
        ["id": "job-1", "title": "Unit assignment", "prompt": "Produce a short report", "status": status,
         "createdAt": "2026-11-07T10:00:00.000Z", "updatedAt": "2026-11-07T10:01:00Z", "stepCount": 1,
         "maxSteps": 3, "maxDurationMinutes": 30, "summary": "One step verified"]
    }
    private static var service: [String: Any] {
        ["service": "RED Loop", "version": "0.4.0", "provider": "workers-ai", "configured": true, "capabilities": ["jobs", "artifacts"]]
    }
    private static func data(_ object: Any) throws -> Data { try JSONSerialization.data(withJSONObject: object) }
    private static func body(_ request: URLRequest) throws -> Data {
        if let data = request.httpBody { return data }
        guard let stream = request.httpBodyStream else { return Data() }
        stream.open(); defer { stream.close() }
        var data = Data(); var buffer = [UInt8](repeating: 0, count: 4096)
        while true {
            let count = stream.read(&buffer, maxLength: 4096)
            if count < 0 { throw stream.streamError ?? URLError(.cannotDecodeRawData) }
            if count == 0 { return data }
            data.append(contentsOf: buffer.prefix(count))
        }
    }
    private func rig(_ handler: @escaping CloudURLProtocol.Handler) throws -> (CloudAPIClient, URLSession) {
        CloudURLProtocol.install(handler)
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [CloudURLProtocol.self]
        let session = URLSession(configuration: config)
        let connection = try CloudConnection(serverURL: "https://unit.test", token: "unit-token")
        return (CloudAPIClient(connection: connection, session: session), session)
    }

    func testStatusRequiresBearerAndDecodesProviderCapabilities() async throws {
        let (client, session) = try rig { request in
            XCTAssertEqual(request.url?.path, "/api/v1/status")
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer unit-token")
            return (200, try Self.data(Self.service))
        }
        defer { session.invalidateAndCancel() }
        let result = try await client.status()
        XCTAssertTrue(result.configured); XCTAssertEqual(result.provider, "workers-ai"); XCTAssertEqual(result.capabilities, ["jobs", "artifacts"])
    }

    func testJobDetailsStepsAndArtifactTextUseDocumentedRoutes() async throws {
        let (client, session) = try rig { request in
            switch request.url?.path {
            case "/api/v1/jobs": return (200, try Self.data(["jobs": [Self.job()]]))
            case "/api/v1/jobs/job-1":
                return (200, try Self.data(["job": Self.job(), "steps": [["index": 1, "createdAt": "2026-11-07T10:01:00Z", "summary": "Report", "output": "Verified output", "status": "completed"]], "artifacts": [["name": "report.md", "content": "# Verified report"]]]))
            case "/api/v1/jobs/job-1/artifacts/report.md": return (200, Data("# Exported report".utf8))
            default: XCTFail("Unexpected API route"); return (404, Data())
            }
        }
        defer { session.invalidateAndCancel() }
        let jobs = try await client.jobs(); XCTAssertEqual(jobs.count, 1); XCTAssertEqual(jobs.first?.createdAt, "2026-11-07T10:00:00.000Z")
        let detail = try await client.detail(id: "job-1")
        XCTAssertEqual(detail.steps.first?.output, "Verified output"); XCTAssertEqual(detail.artifacts.first?.name, "report.md")
        XCTAssertTrue(detail.exportText.contains("# Verified report")); XCTAssertFalse(detail.exportText.contains("unit-token"))
        let content = try await client.artifact(id: "job-1", name: "report.md"); XCTAssertEqual(content, "# Exported report")
    }

    func testCreationSendsLimitsAndUUIDIdempotencyHeader() async throws {
        let key = UUID()
        let (client, session) = try rig { request in
            XCTAssertEqual(request.httpMethod, "POST"); XCTAssertEqual(request.url?.path, "/api/v1/jobs")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Idempotency-Key"), key.uuidString)
            XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
            let body = try JSONSerialization.jsonObject(with: Self.body(request)) as? [String: Any]
            XCTAssertEqual(body?["title"] as? String, "Night report"); XCTAssertEqual(body?["maxSteps"] as? Int, 50); XCTAssertEqual(body?["maxDurationMinutes"] as? Int, 480)
            return (201, try Self.data(["job": Self.job(status: "queued")]))
        }
        defer { session.invalidateAndCancel() }
        let job = try await client.create(CloudJobDraft(title: "Night report", prompt: "Prepare the report", maxSteps: 50, maxDurationMinutes: 480), idempotencyKey: key)
        XCTAssertEqual(job.status, "queued")
    }

    func testPauseResumeAndStopAreExplicitPOSTActions() async throws {
        let (client, session) = try rig { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer unit-token")
            let action = request.url?.lastPathComponent
            XCTAssertTrue(["pause", "resume", "stop"].contains(action ?? ""))
            return (200, try Self.data(["job": Self.job(status: action == "pause" ? "paused" : action == "stop" ? "stopped" : "running")]))
        }
        defer { session.invalidateAndCancel() }
        for action in [CloudJobAction.pause, .resume, .stop] { _ = try await client.control(id: "job-1", action: action) }
        XCTAssertEqual(CloudURLProtocol.requests.compactMap { $0.url?.path }, ["/api/v1/jobs/job-1/pause", "/api/v1/jobs/job-1/resume", "/api/v1/jobs/job-1/stop"])
    }

    func testAuthenticationAndServerConflictAreNotReportedAsSuccess() async throws {
        for code in [401, 403, 409, 503] {
            let (client, session) = try rig { _ in (code, try Self.data(["error": "Server cannot resume this job yet"])) }
            defer { session.invalidateAndCancel() }
            do { _ = try await client.status(); XCTFail("Expected HTTP error") }
            catch let error as CloudAPIError {
                if code == 401 || code == 403 { XCTAssertEqual(error, .unauthorized) }
                else { XCTAssertEqual(error, .server(code, "Server cannot resume this job yet")) }
            }
        }
    }

    func testMalformedServerDataAndNetworkTimeoutAreVisibleErrors() async throws {
        let (invalid, invalidSession) = try rig { _ in (200, Data("not JSON".utf8)) }
        defer { invalidSession.invalidateAndCancel() }
        do { _ = try await invalid.jobs(); XCTFail("Expected malformed data error") } catch let error as CloudAPIError { XCTAssertEqual(error, .invalidResponse) }
        let (timeout, timeoutSession) = try rig { _ in throw URLError(.timedOut) }
        defer { timeoutSession.invalidateAndCancel() }
        do { _ = try await timeout.status(); XCTFail("Expected timeout") } catch let error as CloudAPIError { XCTAssertEqual(error, .timeout) }
    }

    func testInvalidInputCannotReachNetworkAndRedirectsStayOnHTTPSOrigin() async throws {
        XCTAssertThrowsError(try CloudConnection(serverURL: "http://unit.test", token: "unit-token"))
        XCTAssertThrowsError(try CloudConnection(serverURL: "https://user:password@unit.test", token: "unit-token"))
        XCTAssertThrowsError(try CloudConnection(serverURL: "https://unit.test", token: "unit-token\nInjected"))
        XCTAssertFalse(CloudJobDraft(title: String(repeating: "x", count: 121), prompt: "Task", maxSteps: 3, maxDurationMinutes: 30).isValid)
        XCTAssertFalse(CloudJobDraft(title: "Task", prompt: String(repeating: "x", count: 20001), maxSteps: 3, maxDurationMinutes: 30).isValid)
        XCTAssertFalse(CloudJobDraft(title: "Task", prompt: "Task", maxSteps: 3, maxDurationMinutes: 481).isValid)
        XCTAssertFalse(CloudRedirectPolicy.allows(from: URL(string: "https://unit.test/api")!, to: URL(string: "https://other.test/api")!))
        XCTAssertFalse(CloudRedirectPolicy.allows(from: URL(string: "https://unit.test/api")!, to: URL(string: "http://unit.test/api")!))
        XCTAssertTrue(CloudRedirectPolicy.allows(from: URL(string: "https://unit.test/api")!, to: URL(string: "https://unit.test:443/other")!))
        let (client, session) = try rig { _ in XCTFail("Invalid request reached transport"); return (500, Data()) }
        defer { session.invalidateAndCancel() }
        do { _ = try await client.create(CloudJobDraft(title: "Invalid", prompt: "Test", maxSteps: 51, maxDurationMinutes: 30), idempotencyKey: UUID()); XCTFail("Expected validation error") } catch let error as CloudAPIError { XCTAssertEqual(error, .invalidJob) }
        do { _ = try await client.detail(id: "../status"); XCTFail("Expected path validation error") } catch let error as CloudAPIError { XCTAssertEqual(error, .invalidResponse) }
        XCTAssertTrue(CloudURLProtocol.requests.isEmpty)
    }

    @MainActor
    func testFailedConnectionDoesNotPersistCredentialsOrInventJobs() async throws {
        let (client, session) = try rig { _ in (401, try Self.data(["error": "Unauthorized"])) }
        defer { session.invalidateAndCancel() }
        let credentials = MemoryCloudCredentials()
        let store = CloudStore(credentials: credentials, makeClient: { _ in client })
        do { try await store.connect(server: "https://unit.test", token: "unit-token"); XCTFail("Expected authentication failure") } catch { }
        XCTAssertFalse(store.hasConnection); XCTAssertNil(credentials.connection); XCTAssertTrue(store.jobs.isEmpty); XCTAssertNil(store.serviceStatus)
    }

    @MainActor
    func testRetryOfSameDraftReusesIdempotencyKeyAfterTimeout() async throws {
        let (client, session) = try rig { request in
            XCTAssertEqual(request.httpMethod, "POST")
            if CloudURLProtocol.requests.count == 1 { throw URLError(.timedOut) }
            return (201, try Self.data(["job": Self.job(status: "queued")]))
        }
        defer { session.invalidateAndCancel() }
        let credentials = MemoryCloudCredentials(); credentials.connection = try CloudConnection(serverURL: "https://unit.test", token: "unit-token")
        let store = CloudStore(credentials: credentials, makeClient: { _ in client })
        let draft = CloudJobDraft(title: "Retry safely", prompt: "Produce report", maxSteps: 3, maxDurationMinutes: 30)
        do { _ = try await store.create(draft); XCTFail("Expected first timeout") } catch { }
        XCTAssertTrue(store.jobs.isEmpty)
        _ = try await store.create(draft)
        let keys = CloudURLProtocol.requests.compactMap { $0.value(forHTTPHeaderField: "Idempotency-Key") }
        XCTAssertEqual(keys.count, 2); XCTAssertEqual(keys[0], keys[1]); XCTAssertEqual(store.jobs.count, 1)
        store.setActive(false)
        XCTAssertEqual(store.jobs.first?.status, "queued")
        XCTAssertTrue(CloudURLProtocol.requests.allSatisfy { $0.url?.path == "/api/v1/jobs" })
    }
}
