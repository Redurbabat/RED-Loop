import Foundation
import SafariServices

final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        // No credentials, chat contents, shared state, or remote commands cross this boundary.
        let item = NSExtensionItem()
        item.userInfo = [SFExtensionMessageKey: ["version": "0.2.0", "mode": "local-only"]]
        context.completeRequest(returningItems: [item], completionHandler: nil)
    }
}
