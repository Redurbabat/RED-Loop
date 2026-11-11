import Foundation
import UserNotifications

/// What the app tells the user when a run ends on its own.
struct ChatStopNotice: Equatable {
    enum Kind: String { case finished, question, limit, failure }
    let kind: Kind
    let title: String
    let body: String
}

/// Decides, from the panel's own status line, whether a finished run is worth
/// announcing. Pure, so it is covered by tests without a notification centre.
enum ChatStopClassifier {
    /// Stops the user caused or can already see need no announcement.
    private static let silentPrefixes = ["Pausiert", "Gestoppt", "Zurückgesetzt", "Bereit"]

    static func notice(previous: ChatLoopState, current: ChatLoopState) -> ChatStopNotice? {
        guard previous.running, !current.running else { return nil }
        let status = current.status.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !status.isEmpty, !silentPrefixes.contains(where: status.hasPrefix) else { return nil }
        let progress = "\(current.progress) Fortsetzungen"
        if status.contains("Auftrag abgeschlossen") {
            return ChatStopNotice(kind: .finished, title: "Auftrag abgeschlossen",
                                  body: "ChatGPT meldet alle Aufgaben als erledigt. Bitte im Chat prüfen · \(progress)")
        }
        if status.contains("Rückfrage") {
            return ChatStopNotice(kind: .question, title: "ChatGPT hat eine Rückfrage",
                                  body: "Der Loop wartet auf deine Antwort im Chat · \(progress)")
        }
        if status.contains("Limit erreicht") {
            return ChatStopNotice(kind: .limit, title: "Limit erreicht",
                                  body: "Der Loop hat sein Limit erreicht und angehalten · \(progress)")
        }
        return ChatStopNotice(kind: .failure, title: "Loop angehalten", body: "\(status) · \(progress)")
    }
}

/// Local notification for a run that ended while the user looked elsewhere.
/// Nothing is scheduled in advance and nothing leaves the device.
final class ChatNotifier: NSObject, UNUserNotificationCenterDelegate {
    static let categoryIdentifier = "red-loop.stop"
    private let center = UNUserNotificationCenter.current()
    private var requestedAuthorization = false

    override init() {
        super.init()
        center.delegate = self
    }

    /// Asked when a run actually starts, not at launch.
    func requestAuthorizationIfNeeded() {
        guard !requestedAuthorization else { return }
        requestedAuthorization = true
        center.requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    func announce(_ notice: ChatStopNotice) {
        let content = UNMutableNotificationContent()
        content.title = notice.title
        content.body = notice.body
        content.sound = .default
        content.categoryIdentifier = ChatNotifier.categoryIdentifier
        center.add(UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil))
    }

    /// The loop only runs while the app is open, so the banner has to appear
    /// in the foreground as well — that is the whole point of the reminder.
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .list])
    }
}
