import Foundation
import Combine

@MainActor
final class CloudStore: ObservableObject {
    @Published private(set) var hasConnection = false
    @Published private(set) var serverAddress = CloudConnection.defaultServer
    @Published private(set) var serviceStatus: CloudServiceStatus?
    @Published private(set) var jobs: [CloudJob] = []
    @Published private(set) var errorMessage: String?
    @Published private(set) var isLoading = false
    @Published private(set) var isMutating = false
    @Published private(set) var lastUpdated: Date?
    private let credentials: CloudCredentialStoring
    private let makeClient: (CloudConnection) -> CloudAPIClient
    private var client: CloudAPIClient?
    private var revision = UUID()
    private var polling: Task<Void, Never>?
    private var active = false
    private var submission: (draft: CloudJobDraft, key: UUID)?

    init(credentials: CloudCredentialStoring = KeychainCloudCredentials(), makeClient: @escaping (CloudConnection) -> CloudAPIClient = { CloudAPIClient(connection: $0) }) {
        self.credentials = credentials; self.makeClient = makeClient
        do {
            if let connection = try credentials.load() {
                client = makeClient(connection); serverAddress = connection.serverURL; hasConnection = true
            }
        } catch { errorMessage = error.localizedDescription }
    }
    var canCreateJob: Bool { hasConnection && serviceStatus?.configured == true && !isMutating }

    func connect(server: String, token: String) async throws {
        guard !isMutating else { throw CloudAPIError.busy }
        isMutating = true
        defer { isMutating = false }
        let connection = try CloudConnection(serverURL: server, token: token)
        let candidate = makeClient(connection)
        let status = try await candidate.status()
        let fetchedJobs = try await candidate.jobs()
        try credentials.save(connection)
        polling?.cancel(); revision = UUID(); submission = nil
        client = candidate; serverAddress = connection.serverURL; hasConnection = true
        serviceStatus = status; jobs = fetchedJobs; errorMessage = nil; lastUpdated = Date(); isLoading = false
        if active { startPolling() }
    }
    func disconnect() throws {
        try credentials.remove()
        polling?.cancel(); polling = nil; client = nil; revision = UUID(); submission = nil
        hasConnection = false; serviceStatus = nil; jobs = []; lastUpdated = nil; errorMessage = nil; isLoading = false
    }
    func setActive(_ value: Bool) {
        active = value
        polling?.cancel(); polling = nil
        if value && hasConnection { startPolling() }
    }
    private func startPolling() {
        polling?.cancel()
        polling = Task { [weak self] in
            while !Task.isCancelled {
                guard self != nil else { return }
                await self?.refresh()
                do { try await Task.sleep(nanoseconds: 8_000_000_000) } catch { return }
            }
        }
    }
    func refresh() async {
        guard let client = client, !isLoading else { return }
        let expected = revision
        isLoading = true
        defer { if revision == expected { isLoading = false } }
        do {
            async let status = client.status()
            async let fetchedJobs = client.jobs()
            let result = try await (status, fetchedJobs)
            guard revision == expected, !Task.isCancelled else { return }
            serviceStatus = result.0; jobs = result.1; errorMessage = nil; lastUpdated = Date()
        } catch is CancellationError { }
        catch { if revision == expected { errorMessage = error.localizedDescription } }
    }
    func create(_ draft: CloudJobDraft) async throws -> CloudJob {
        guard let client = client else { throw CloudAPIError.notConnected }
        guard !isMutating else { throw CloudAPIError.busy }
        guard draft.isValid else { throw CloudAPIError.invalidJob }
        let expected = revision
        isMutating = true
        defer { isMutating = false }
        let key: UUID
        if let previous = submission, previous.draft == draft { key = previous.key }
        else { key = UUID(); submission = (draft, key) }
        let job = try await client.create(draft, idempotencyKey: key)
        guard revision == expected else { throw CloudAPIError.notConnected }
        submission = nil; upsert(job); errorMessage = nil
        return job
    }
    func detail(id: String) async throws -> CloudJobDetail {
        guard let client = client else { throw CloudAPIError.notConnected }
        let expected = revision
        let result = try await client.detail(id: id)
        guard revision == expected else { throw CloudAPIError.notConnected }
        upsert(result.job)
        return result
    }
    func control(id: String, action: CloudJobAction) async throws -> CloudJob {
        guard let client = client else { throw CloudAPIError.notConnected }
        guard !isMutating else { throw CloudAPIError.busy }
        let expected = revision
        isMutating = true
        defer { isMutating = false }
        let job = try await client.control(id: id, action: action)
        guard revision == expected else { throw CloudAPIError.notConnected }
        upsert(job); errorMessage = nil
        return job
    }
    func artifact(id: String, name: String) async throws -> String {
        guard let client = client else { throw CloudAPIError.notConnected }
        let expected = revision
        let content = try await client.artifact(id: id, name: name)
        guard revision == expected else { throw CloudAPIError.notConnected }
        return content
    }
    private func upsert(_ job: CloudJob) {
        if let index = jobs.firstIndex(where: { $0.id == job.id }) { jobs[index] = job }
        else { jobs.insert(job, at: 0) }
    }
}
