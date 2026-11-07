# Test evidence — 6–7 November 2026

This report distinguishes executed checks from prepared code. A browser viewport profile is not a physical device test; parsing an Xcode project is not compilation.

**Current follow-up — v0.3.1:** **48 unit tests and 17 focused browser checks passed across full/focused runs**. The packaged extension sent from a genuinely hidden, unfocused native Chromium page: the send handler recorded `document.hidden === true` and `document.hasFocus() === false`, then completion stopped further sends. This uses an isolated temporary browser/profile and `connectOverCDP({noDefaults:true})`; no user browser/account or visibility emulation is involved. A foreground test separately verifies stopping on real focus loss. Its initial extra requirement that the unfocused page also be hidden was removed; the corrected test passed. Version 0.3.1 also prevents premature stops from another chat's errors, ordinary retry advice or nonfinal completion markers. Current deployment: `e21cc58e-7207-4c57-81fc-74cd09ef36e0`.

**Real Edge work-preset run — v0.3.0:** two benign text steps were automatically requested and acknowledged, then the final marker stopped the loop at **2/3 — Auftrag abgeschlossen**. The test tab and screenshot stay local. This proves live task continuation/completion; natural hidden-tab acceptance is the separate v0.3.1 fixture result above. No overnight endurance or current iOS compilation is claimed. See [background-work.md](background-work.md) and [windows-live-test.md](windows-live-test.md).

**Prior follow-up — v0.2.4:** configurable automatic follow-up text passed 35 unit tests, 14 focused browser checks and a real installed-extension/live ChatGPT test in Windows Edge. A custom message containing multiple lines and an empty paragraph was sent twice automatically, received two answers and stopped at **2/2 — Limit erreicht**. Version 0.2.4 fixed live paragraph spacing while preserving exact prepared-draft edit protection. See [windows-live-test.md](windows-live-test.md); screenshots remain local.

**Prior follow-up — v0.2.2:** the Windows live test exposed current-UI and cached-pane compatibility gaps. That correction passed 29 unit tests and a real installed-extension/live ChatGPT test in Windows Edge (controlled run: 0/1 → 1/1, answer received, automatic stop at the limit). See [windows-live-test.md](windows-live-test.md); screenshots remain local to the user. The 35-browser-check and native archive evidence below describes the 0.2.0 baseline. Current shared Safari JavaScript and native privacy wording have not been rebuilt on iOS.

## Baseline delivery and verification

- Interactive test URL: **https://red-loop.redurbabat7.workers.dev/**
- Health endpoint: **https://red-loop.redurbabat7.workers.dev/health**
- Windows extension ZIP: **https://red-loop.redurbabat7.workers.dev/red-loop-browser-extension.zip** (HTTP 200; root manifest, popup, icon, installation guide and canonical content script checked).
- Wrangler deployment succeeded. Version: `e0d7948b-700d-4908-b0a6-67528f72c19c`.
- Health checked after deployment: HTTP 200, version `0.2.0`, mode `local-demo`, `storesConversations: false`.
- Pull request: **https://github.com/Redurbabat/RED-Loop/pull/2** (against `main`, not merged).
- Feature branch: `codex/red-loop-testable-preview`. Remote `main` baseline: `cfe63fcefaf00adcedfa74224028f41e12717885`.

| Evidence level | Actual result |
|---|---|
| JavaScript syntax | PASS — `npm run check`, all owned JS/MJS sources and tests |
| Config/project structure | PASS — JSON/YAML and 3-target pbxproj parsed; plist/privacy/scheme XML parsed; extension source parity verified |
| Web build | PASS — `npm run build` |
| Worker build | PASS — `npm run dry-run` with Wrangler 4.158.0 and Assets binding; binding/runtime types generated |
| Unit tests | PASS — baseline 16/16; current browser follow-up 48/48 via `npm test`, including background gating, final completion markers, active-chat error isolation, custom paragraphs and asynchronous composer safety |
| Chromium browser tests | PASS — 8/8 against the deployed URL: bounded controls, scenarios, navigation/history, accessibility in light/system-dark/explicit-dark, Reduced Motion, 320px layout, keyboard, health, real contenteditable insertion and draft preservation on intercepted fixtures |
| WebKit viewport tests | PASS — 24/24 checks across iPhone, iPad and MacBook profiles using Playwright WebKit 27.2 on Windows. This is not physical Safari validation. |
| Packaged Windows extension | PASS — 3/3 checks: downloadable ZIP, actual Chromium extension loading/injection, explicit activation, bounded sends, duplicate prevention, stop/reset, draft preservation and automatic light/dark appearance |
| Cloudflare deployment | PASS — actual Wrangler upload and trigger deployment; live HTTP health verified |
| iOS simulator build/XCTest | PASS — final native source `92a947f`, Codemagic/Xcode 26.6, four model test cases; final build finished successfully |
| Unsigned iOS device archive | PASS — final native source, including embedded Safari extension; not installable without signing |
| Signed device archive / IPA / TestFlight | **NICHT GETESTET / NOT PRODUCED** — no signing identities or profiles configured |
| Physical iPhone, iPad, Mac Safari | **NICHT GETESTET** |
| Live ChatGPT conversation | PASS in Windows Edge with installed v0.3.0: two benign work-preset steps acknowledged and stopped at 2/3 on the completion marker. v0.2.4 separately passed a custom multiline two-send/2/2 run. Hidden/unfocused acceptance uses the isolated v0.3.1 native Chromium fixture, not the live Edge run. |
| VoiceOver and physical iOS website permissions | **NICHT GETESTET** |

## iOS external services

The new RED-Loop Codemagic application is configured at:

https://codemagic.io/app/6aeddc59edd02d4de06b9379/settings

Initial simulator/XCTest/unsigned archive build **finished successfully** on Codemagic with Xcode 26.6:

https://codemagic.io/app/6aeddc59edd02d4de06b9379/build/6aeddcf6e348ff611c865e9b

This first build targets `dac3634`; the log reports `ARCHIVE SUCCEEDED`, after the script's successful `xcodebuild test` stage. It emitted simulator app, XCTest result bundle, logs and an unsigned device archive.

Final native source verification, including navigation/rotation fixes and shared extension styling, **finished successfully** at `92a947f` in 3m 51s:

https://codemagic.io/app/6aeddc59edd02d4de06b9379/build/6aede10324e1ec237556d2e1

The baseline final run reports `ARCHIVE SUCCEEDED`; simulator tests completed before the archive under `set -euo pipefail`. At that handoff, subsequent commits changed documentation/browser assertions only. The later Windows follow-ups change the shared Safari JavaScript resource, manifest and native privacy wording; their iOS packaging is **NICHT GETESTET**. Native model logic and build configuration remain unchanged.

Final browser evidence comprises 35 distinct checks. One full run passed all 35. Following the extension appearance change, a second full run passed 34 and exposed an overly strict timing assumption in the stop test: an iPhone-profile step could complete before the automated Stop click. The assertion now records the count at Stop and verifies it remains unchanged; the corrected test passed on all four profiles. It uses limit 50 during this stop check so a slow click cannot race with normal completion. No failing assertion is left unresolved.

The equivalent GitHub Actions run [42228193993](https://github.com/Redurbabat/RED-Loop/actions/runs/42228193993) did **not start either job**. Its check annotations state: “The job was not started because an Actions budget is preventing further use.” No simulator or Linux browser success is inferred from this run. Billing settings were not changed.

Codemagic signing settings were inspected read-only: **no iOS certificates**, **no provisioning profiles**, and **Apple Developer Portal integration disabled**. Apple membership itself is unknown. Enable that integration or securely import the distribution certificate/private key and both app/extension profiles, then add `APPLE_TEAM_ID` in `red_loop_signing`. Exact activation steps are in [deployment.md](deployment.md).

## Preview evidence

Screenshots under `docs/previews/` are captured from the actual web dashboard by Playwright. Names identify browser engine/profile and appearance. They are web viewport previews, not screenshots of the native SwiftUI host or real Apple hardware.

## Remaining acceptance work

- Provide signing through Codemagic secure settings for an installable iPhone/TestFlight build.
- Execute physical Safari/iPhone checks, including extension activation, Website Access, VoiceOver, rotation, focus/visibility stops and a non-sensitive live conversation with limit 1.
- Review and merge PR #2 only after the user accepts the changes. The agent does not merge it.
