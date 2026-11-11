# RED Loop

RED Loop provides a **private Cloudflare workspace**, an iPhone client that shows ChatGPT in the app and continues a conversation automatically until you pause, a browser-local demo and a bounded ChatGPT extension. Cloud jobs keep working when the phone is locked or the laptop is off. They create downloadable text/code artifacts and read supported public documentation; they do not control existing ChatGPT chats or the user's computer. Continuing an existing ChatGPT conversation always happens in the user's own signed-in page — in the app's Chat tab or in a browser — never from the server.

## Cloud jobs on iPhone and web

Open [RED Loop](https://red-loop.redurbabat7.workers.dev/) and choose **Cloud-Aufträge**, or use the native app's Cloud view. Connect using the private workspace token, enter an assignment and choose step/time limits. Track the result, download artifacts, pause, resume or stop. The web console keeps the token only in memory; the iPhone client uses the device Keychain.

Cloudflare Workers AI is the default model provider. Jobs and results persist in a SQLite Durable Object; alarms schedule work independently of the client. A provider outage, an unavailable capability, an ambiguous interruption or a limit produces an explicit status. This is a single-owner preview with bounded storage and execution. [Setup, API and capability details](docs/cloud-jobs.md).

Codemagic's `ios-preview` workflow tests the app and creates an **unsigned IPA** for separate signing. The manual `ios-signed` workflow exports an App Store IPA once Apple identities and both app/extension profiles are configured. A signed TestFlight or appropriately provisioned build is required to install on an iPhone. [Installation and signing](docs/deployment.md).

## Try the demo locally

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:8787**. Choose a limit (1–50), press **Demo starten**, observe the simulated messages and counter, then try **Stopp** and **Zurücksetzen**. The scenario menu lets you test response errors and existing-draft protection without credentials. Leaving the dashboard or hiding the tab stops the demo.

The responsive RED Morph interface includes light/dark/system appearance, keyboard controls, accessible status/error announcements, progress, bounded activity history, and Reduced Motion support. Demo content stays in tab memory; only the chosen appearance is saved locally.

The **homepage includes a RED Morph component finder with lazy static Canvas previews**: see what all twelve original studies look like directly on the dashboard, search and filter by scene metadata, bookmark or remove a study directly on the homepage card using its independent star button, filter your browser-local ★ saved scenes, compare any two original studies side by side with still Canvas previews, inspect and copy their canonical integration code or download a three-file starter ZIP (HTML demo, original engine, README) directly from each card; the Motion Studio Einbau tab additionally exports a starter ZIP with the currently selected scene and live density, depth, speed and hue settings, or open a study in Motion Studio with one click. Each visible preview is drawn once from the original engine and immediately released; thumbnails never autoplay. The finder works at phone, tablet, MacBook and Windows web viewport sizes and never sends search terms to the cloud. See [homepage discovery behavior](docs/scene-discovery.md).

## Real browser integration

**Windows / Edge / Chrome:** [download the ready-to-load extension ZIP](https://red-loop.redurbabat7.workers.dev/red-loop-browser-extension.zip), extract it, open `edge://extensions` or `chrome://extensions`, enable Developer mode and choose **Load unpacked**. Select the extracted folder and reload the ChatGPT tab. A userscript manager is not required for this path. [Detailed Windows instructions](extensions/README.md).

1. Use the standalone [Userscripts Safari extension](https://github.com/quoid/userscripts) on iPhone/iPad/Mac, or a compatible userscript manager on Windows.
2. Import `userscripts/red-loop.user.js` (also downloadable from the deployed dashboard's Integration view).
3. Grant website access only to `chatgpt.com` (the legacy host is included for redirects).
4. Open an existing `/c/...` conversation with an assistant response. Enter your repeated message in **Automatischer Folgetext** in the RED Loop panel, choose a small limit and press **Start**. After each completed response, the panel sends that text again until the limit or Pause. Instead of a number you can tick **Endlos bis Pause**: the run then ends only on Pause, a completion or user-input marker, or a detected error, and consumes quota until then.
5. For Windows background operation, enable **Auch im Hintergrund weiterarbeiten** before Start. Leave the browser/chat open and the PC awake. Without this option, keep the tab visible and focused. **Pause** is reachable in the minimized panel.
6. Several chats at once: one tab per conversation, background option and Start in each. State is per chat, so each tab keeps its own counter and limit. This is the only way to keep continuations running while the phone is locked or away — the PC does the work.

The script never overwrites a composer draft or stores credentials. It stops on navigation, detected errors and missing composer. Hidden tabs/focus loss stop the foreground mode; the explicit background option permits them. It waits for a new response after each send; an unchanged previous answer cannot trigger duplicate execution. Counters, limits, follow-up text (1–4000 characters) and the background preference are kept in per-chat tab session storage; reload never restarts a run. Stop before editing; Reset keeps the text.

For an evening task, give ChatGPT the initial assignment and wait for its first response. In RED Loop select **Text für offene Aufgaben laden**, enable the background option, choose a limit (1–50) and press Start. The preset requests concrete work on remaining tasks, a final completion marker or an explicit request for user input. RED Loop stops on those markers or at the limit; it does not independently verify the assistant's claims. For long Edge sessions, add `https://chatgpt.com` to **Settings → System and performance → Performance → Always keep these sites active**. Sleeping tabs pause JavaScript; see [Microsoft's explanation](https://support.microsoft.com/en-us/edge/learn-about-performance-features-in-microsoft-edge). Browser closure, suspended tabs, Windows sleep and iOS background suspension cannot execute the loop.

The Windows developer package has baseline tests as an actual loaded Chromium extension against intercepted fixtures, plus the real Edge/live-service follow-up below. A separate physical Chrome check is still outstanding. Safari distribution uses the native host described below.

**Windows verification:** the installed v0.3.0 work preset completed two benign steps in actual Edge/live ChatGPT and stopped at 2/3 on the completion marker. Script v0.5.0 passes 100 unit tests and 23 of 24 executed Chromium browser checks, including endless mode sending past a numeric limit in the loaded extension, two conversations looping side by side with separate counters, and the app-style injection reporting counters only; the exception is the headed natural-visibility check, which cannot start as root in the current container. WebKit profiles and all iOS work were not executed there. Its isolated native Chromium test records `document.hidden === true` and `document.hasFocus() === false` at the actual send event, then verifies completion stopping. This is separate from the real-service Edge run and from overnight endurance. See [evidence and version boundaries](docs/windows-live-test.md). The broader historical browser/iOS results concern the baseline labeled in the report.

## Android tablet: several chats with the screen off

The Android app (`android/`) is the only RED Loop path where continuations keep running while the screen is off and you do something else — iOS forbids that, Android allows it through a foreground service. It runs **up to eight conversations at once**, each in its own web view with its own panel, counter and limit, and the views belong to the service rather than to the screen, so leaving the app does not stop a run. Each tab takes its name from the ChatGPT conversation and can be renamed, remembers which conversation it had open across restarts, and an **Übersicht** screen lists every chat with its status, counter and its own Pause button. An ongoing notification shows how many chats are active and carries **Alle pausieren**; each chat posts its own notification when its run ends on its own.

Codemagic's `android-preview` workflow runs the JVM unit tests and builds `app-debug.apk`, which is signed with the standard debug key and installs directly on a tablet — no developer account, no store, no profiles.

**On Xiaomi this needs four manual steps** (allow notifications, enable Autostart, set battery saving to "no restrictions", lock the app in recents), because MIUI and HyperOS kill background apps aggressively regardless of how the app is built. **Nothing here has been verified on a device yet.** [Installation, Xiaomi setup, mechanics and limits](docs/android.md).

## ChatGPT inside the iPhone app

The app's **Chat** tab loads `chatgpt.com` in an in-app web view and puts the RED Loop panel on top of it, so no Safari extension and no website permission is involved. Sign in once inside the app, write the assignment into the chat yourself, wait for the first answer, then press **Start** in the panel. After every completed answer the panel sends your follow-up text again — with **Endlos bis Pause** without a step number, until you press **Pause**. Pause is always reachable from the app's bottom bar; Start stays in the panel so the follow-up text and limit are checked first. A pause keeps the counter, so Start resumes the same run. Drag the panel by its header to move it out of the way; the position holds across chats and reloads.

The in-app ChatGPT script defaults to the exact version bundled with the signed app. When an owner-prepared P-256 public release key is included in the installed app, it also accepts a higher-version remote script only after verifying the signed manifest, SHA-256 digest, and persisted anti-rollback sequence. Without that key, remote and cached scripts must match the bundled bytes. Any invalid or unreachable release falls back to the last verified or bundled script. Native end-to-end validation is pending.

When a run ends on its own — completion marker, question, limit or error — the app posts a local notification with the reason and the counter, so the phone can lie on the desk unwatched; a pause you triggered yourself stays silent. The loop runs only while the app is in the foreground, and the screen stays awake during a run. Locking the phone or switching apps makes iOS suspend the page; on return the panel keeps waiting instead of reporting a stall, and if iOS discarded the page it reports that it paused, so one Start resumes the same run with the same counter. For work after closing the app, use cloud jobs. Automatic continuations consume ChatGPT quota continuously. **This view has not been verified on a physical iPhone.** [Flow, limits and script delivery](docs/iphone-chat.md).

## Native iPhone/iPad host

Open `ios/REDLoop.xcodeproj` in Xcode on a Mac and select the shared **REDLoop** scheme. The project contains:

- In-app ChatGPT view with the injected continuation panel, native pause, stop notifications, script source switch and app-only sign-out.
- Private cloud client: connection, job creation, progress, controls and artifact sharing.
- Separate SwiftUI demo dashboard, bounded controls, scenarios, events and privacy information.
- Activation/permission troubleshooting for the embedded Safari Web Extension.
- App, extension and XCTest targets; iOS/iPadOS 17+ deployment target.
- App icons, adaptive semantic colors, Reduce Motion and Dynamic Type layouts.

Cloud controls act on the private server workspace. Demo controls affect only the local demo. For the separate Safari integration, activate the extension in **Settings → Apps → Safari → Extensions → RED Loop**, grant `chatgpt.com` access, and start real continuations from the page panel. Safari background suspension does not affect cloud jobs.

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

GitHub Actions validates pull requests and pushes to `main` with individual build, check, unit, dry-run and browser stages. The latest GitHub logs showed a successful iOS simulator build but two failing Web Motion Studio test assumptions; their corrections are included in this branch and require the next CI run to verify. Cloudflare Workers Builds reports an additional failure; do not treat a merge as a successful deployment. See [CI troubleshooting](docs/ci-troubleshooting.md).

`check` verifies JS syntax, JSON/YAML, Xcode project structure and extension-source parity. It is **not an iOS compilation**. Browser tests include four platform viewport profiles, light/dark accessibility scans, keyboard and Reduced Motion, navigation and safety scenarios. Userscript browser tests run against intercepted local fixtures, never a live conversation.

On macOS, `bash scripts/ios-ci.sh` executes XCTest on an available iPhone simulator and creates an unsigned device archive. Codemagic workflows use the same scripts. [Test evidence](docs/test-report.md) distinguishes each validation level and lists untested items.

## Documentation and source

- [ChatGPT in the iPhone app](docs/iphone-chat.md)
- [Android: several chats with the screen off](docs/android.md)
- [Deployment and signing](docs/deployment.md)
- [Architecture and safety boundaries](docs/architecture.md)
- [RED Morph design tokens](docs/brand-spec.md)
- [Platform web previews](docs/previews/)
- [Test report and remaining blockers](docs/test-report.md)

The pre-existing `vendor/userscripts/` snapshot is retained unchanged and is not linked into the new RED Loop app. It has its own GPL-3.0 license. The optional standalone Userscripts host remains a separate product.

ChatGPT's DOM can change. Automation consumes usage and is subject to the service's terms and limits. Physical Safari/iPhone verification is required before treating this test preview as a release.
