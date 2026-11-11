import XCTest
@testable import REDLoop

final class ChatNotifierTests: XCTestCase {
    private func state(running: Bool, count: Int = 0, limit: Int = 10, endless: Bool = false, status: String) -> ChatLoopState {
        var value = ChatLoopState()
        value.running = running
        value.count = count
        value.limit = limit
        value.endless = endless
        value.status = status
        return value
    }

    func testOnlyAFinishedRunIsAnnounced() {
        let running = state(running: true, count: 2, status: "Endlos aktiv · 2/∞")
        XCTAssertNil(ChatStopClassifier.notice(previous: running, current: state(running: true, count: 3, status: "Fortsetzung 3/∞ gesendet")))
        XCTAssertNil(ChatStopClassifier.notice(previous: state(running: false, status: "Bereit · 0/10"),
                                               current: state(running: false, status: "Antwortfehler erkannt")))
    }

    func testStopsTheUserCausedStaySilent() {
        let running = state(running: true, count: 4, endless: true, status: "Endlos aktiv · 4/∞")
        for status in ["Pausiert · Start setzt fort", "Pausiert: Seite verlassen", "Pausiert: Browser-Tab nicht aktiv",
                       "Gestoppt: Konversation gewechselt", "Zurückgesetzt", "Bereit · 0/10"] {
            XCTAssertNil(ChatStopClassifier.notice(previous: running, current: state(running: false, count: 4, endless: true, status: status)), status)
        }
    }

    func testCompletionQuestionAndLimitAreClassifiedApart() {
        let running = state(running: true, count: 5, limit: 5, status: "Aktiv · 5/5")
        let finished = ChatStopClassifier.notice(previous: running, current: state(running: false, count: 5, limit: 5, status: "Auftrag abgeschlossen"))
        XCTAssertEqual(finished?.kind, .finished)
        XCTAssertEqual(finished?.title, "Auftrag abgeschlossen")
        XCTAssertTrue(finished?.body.contains("5 / 5 Fortsetzungen") == true)

        let question = ChatStopClassifier.notice(previous: running, current: state(running: false, count: 5, limit: 5, status: "Rückfrage – bitte Chat prüfen"))
        XCTAssertEqual(question?.kind, .question)
        XCTAssertTrue(question?.title.contains("Rückfrage") == true)

        let limit = ChatStopClassifier.notice(previous: running, current: state(running: false, count: 5, limit: 5, status: "Limit erreicht"))
        XCTAssertEqual(limit?.kind, .limit)
    }

    func testAnyOtherStopKeepsItsReasonInTheBody() {
        let running = state(running: true, count: 7, endless: true, status: "Endlos aktiv · 7/∞")
        for status in ["Antwortfehler erkannt", "Entwurf erkannt – nicht überschrieben", "Senden nicht verfügbar – bitte prüfen",
                       "Keine neue Antwort – bitte ChatGPT prüfen", "Eingabefeld nicht gefunden – bitte Oberfläche prüfen"] {
            let notice = ChatStopClassifier.notice(previous: running, current: state(running: false, count: 7, endless: true, status: status))
            XCTAssertEqual(notice?.kind, .failure, status)
            XCTAssertTrue(notice?.body.contains(status) == true, status)
            XCTAssertTrue(notice?.body.contains("7 / ∞ Fortsetzungen") == true, status)
        }
    }

    func testAnEmptyStatusIsNeverAnnounced() {
        let running = state(running: true, count: 1, status: "Aktiv · 1/10")
        XCTAssertNil(ChatStopClassifier.notice(previous: running, current: state(running: false, count: 1, status: "   ")))
    }
}
