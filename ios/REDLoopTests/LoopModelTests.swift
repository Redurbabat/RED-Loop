import XCTest
@testable import REDLoop

@MainActor
final class LoopModelTests: XCTestCase {
    func testBoundedStartAndDuplicateRejection() {
        let model = LoopModel(automatic: false); model.limit = 2
        XCTAssertTrue(model.start()); XCTAssertFalse(model.start())
        model.advance(); model.advance(); model.advance()
        XCTAssertEqual(model.count, 2); XCTAssertEqual(model.status, .completed)
    }
    func testStopResetAndResume() {
        let model = LoopModel(automatic: false); model.start(); model.advance(); model.stop(); model.advance()
        XCTAssertEqual(model.count, 1); XCTAssertEqual(model.status, .stopped)
        model.start(); model.advance(); XCTAssertEqual(model.count, 2)
        model.reset(); model.advance(); XCTAssertEqual(model.count, 0); XCTAssertEqual(model.status, .ready)
    }
    func testInvalidLimits() {
        for limit in [0, 51] {
            let model = LoopModel(automatic: false); model.limit = limit
            XCTAssertFalse(model.start()); XCTAssertEqual(model.status, .error)
        }
        for limit in [1, 50] { let model = LoopModel(automatic: false); model.limit = limit; XCTAssertTrue(model.start()); model.stop() }
    }
    func testErrorsAndDraftsDoNotContinue() {
        for scenario in [LoopModel.Scenario.error, .draft] {
            let model = LoopModel(automatic: false); model.scenario = scenario; model.start(); model.advance()
            XCTAssertEqual(model.count, 0); XCTAssertEqual(model.status, .error); XCTAssertNotNil(model.errorMessage)
        }
    }
}
