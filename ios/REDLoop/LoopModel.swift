import Foundation
import Combine

@MainActor
final class LoopModel: ObservableObject {
    enum Status: String { case ready = "Bereit", running = "Demo läuft", stopped = "Gestoppt", completed = "Limit erreicht", error = "Sicher gestoppt" }
    enum Scenario: String, CaseIterable, Identifiable {
        case normal = "Normaler Ablauf", error = "Antwortfehler", draft = "Vorhandener Entwurf"
        var id: String { rawValue }
    }
    @Published private(set) var status: Status = .ready
    @Published private(set) var count = 0
    @Published var limit = 5
    @Published var scenario: Scenario = .normal
    @Published private(set) var events: [String] = []
    @Published private(set) var errorMessage: String?
    private var task: Task<Void, Never>?
    private let automatic: Bool
    var isRunning: Bool { status == .running }

    init(automatic: Bool = true) { self.automatic = automatic }
    @discardableResult func start() -> Bool {
        guard !isRunning else { return false }
        guard (1...50).contains(limit) else {
            fail("Bitte ein Limit von 1 bis 50 wählen."); return false
        }
        if count >= limit { count = 0 }
        errorMessage = nil; status = .running
        log("Demo gestartet. Keine Verbindung zu Safari oder ChatGPT.")
        if automatic {
            task = Task { [weak self] in
                while !Task.isCancelled {
                    do { try await Task.sleep(nanoseconds: 1_600_000_000) } catch { return }
                    guard let self = self, self.isRunning, !Task.isCancelled else { return }
                    self.advance()
                    if !self.isRunning { return }
                }
            }
        }
        return true
    }
    func advance() {
        guard isRunning else { return }
        guard scenario == .normal else {
            fail(scenario == .draft ? "Entwurf erkannt. Vorhandene Eingaben werden geschützt." : "Simulierter Antwortfehler. Bitte erneut starten oder zurücksetzen."); return
        }
        count += 1; log("Demo-Schritt \(count) von \(limit) abgeschlossen.")
        if count >= limit { task?.cancel(); task = nil; status = .completed; log("Limit erreicht. Demo beendet.") }
    }
    func stop() {
        guard isRunning else { return }
        task?.cancel(); task = nil; status = .stopped; log("Gestoppt. Keine weiteren Fortsetzungen.")
    }
    func reset() {
        task?.cancel(); task = nil; count = 0; status = .ready; errorMessage = nil; events = []
        log("Zurückgesetzt. Bereit für einen neuen Test.")
    }
    private func fail(_ message: String) {
        task?.cancel(); task = nil; status = .error; errorMessage = message; log(message)
    }
    private func log(_ message: String) { events.insert(message, at: 0); events = Array(events.prefix(50)) }
}
