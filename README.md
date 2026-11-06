# RED Loop

RED Loop provides a **working browser-local demo**, a bounded ChatGPT userscript, and a native SwiftUI iOS host with an embedded Safari Web Extension. The web dashboard and native demo do not control other browser tabs.

## Try the demo locally

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:8787**. Choose a limit (1–50), press **Demo starten**, observe the simulated messages and counter, then try **Stopp** and **Zurücksetzen**. The scenario menu lets you test response errors and existing-draft protection without credentials. Leaving the dashboard or hiding the tab stops the demo.

The responsive RED Morph interface includes light/dark/system appearance, keyboard controls, accessible status/error announcements, progress, bounded activity history, and Reduced Motion support. Demo content stays in tab memory; only the chosen appearance is saved locally.

## Real browser integration

**Windows / Edge / Chrome:** [download the ready-to-load extension ZIP](https://red-loop.redurbabat7.workers.dev/red-loop-browser-extension.zip), extract it, open `edge://extensions` or `chrome://extensions`, enable Developer mode and choose **Load unpacked**. Select the extracted folder and reload the ChatGPT tab. A userscript manager is not required for this path. [Detailed Windows instructions](extensions/README.md).

1. Use the standalone [Userscripts Safari extension](https://github.com/quoid/userscripts) on iPhone/iPad/Mac, or a compatible userscript manager on Windows.
2. Import `userscripts/red-loop.user.js` (also downloadable from the deployed dashboard's Integration view).
3. Grant website access only to `chatgpt.com` (the legacy host is included for redirects).
4. Open an existing `/c/...` conversation with an assistant response, choose a small limit and press **Start in the RED Loop panel on that page**.
5. Keep the tab visible and focused. **Stopp** is always reachable, including in the minimized panel.

The script never overwrites a draft or stores credentials. It stops on navigation, hidden tabs, focus loss, detected errors and missing composer. It waits for a new response after each send; an unchanged previous answer cannot trigger duplicate execution. Only counters and limits are kept in session storage; reload never restarts a run.

The Windows developer package has baseline tests as an actual loaded Chromium extension against intercepted fixtures, plus the real Edge/live-service follow-up below. A separate physical Chrome check is still outstanding. Safari distribution uses the native host described below.

**Windows live follow-up:** extension v0.2.2 was also tested in the user's actual Edge browser against a dedicated live ChatGPT text conversation. The controlled run sent one continuation and stopped at 1/1. It supports the current composer/message markup and excludes cached background conversations. See [live evidence](docs/windows-live-test.md). The broader historical browser/iOS results refer to the earlier baseline as labeled in the report.

## Native iPhone/iPad host

Open `ios/REDLoop.xcodeproj` in Xcode on a Mac and select the shared **REDLoop** scheme. The project contains:

- SwiftUI demo dashboard, bounded controls, scenarios, events and privacy information.
- Activation/permission troubleshooting for the embedded Safari Web Extension.
- App, extension and XCTest targets; iOS/iPadOS 17+ deployment target.
- App icons, adaptive semantic colors, Reduce Motion and Dynamic Type layouts.

The host's start/stop buttons control only its own demo. Activate the extension in **Settings → Apps → Safari → Extensions → RED Loop**, grant `chatgpt.com` access, and start real continuations from the page panel. No background, lock-screen execution or multi-tab automation is promised.

An Apple signing identity and matching **app and extension** provisioning profiles are required for installation on a physical iPhone. This repository contains no signing secrets. See [deployment instructions](docs/deployment.md).

## Checks

```sh
npm run build
npm run check
npm test
npx playwright install chromium webkit
npm run test:browser
npm run dry-run
```

`check` verifies JS syntax, JSON/YAML, Xcode project structure and extension-source parity. It is **not an iOS compilation**. Browser tests include four platform viewport profiles, light/dark accessibility scans, keyboard and Reduced Motion, navigation and safety scenarios. Userscript browser tests run against intercepted local fixtures, never a live conversation.

On macOS, `bash scripts/ios-ci.sh` executes XCTest on an available iPhone simulator and creates an unsigned device archive. Codemagic workflows use the same scripts. [Test evidence](docs/test-report.md) distinguishes each validation level and lists untested items.

## Documentation and source

- [Deployment and signing](docs/deployment.md)
- [Architecture and safety boundaries](docs/architecture.md)
- [RED Morph design tokens](docs/brand-spec.md)
- [Platform web previews](docs/previews/)
- [Test report and remaining blockers](docs/test-report.md)

The pre-existing `vendor/userscripts/` snapshot is retained unchanged and is not linked into the new RED Loop app. It has its own GPL-3.0 license. The optional standalone Userscripts host remains a separate product.

ChatGPT's DOM can change. Automation consumes usage and is subject to the service's terms and limits. Physical Safari/iPhone verification is required before treating this test preview as a release.
