# Windows live test and browser compatibility — 6–7 November 2026

## Verified work cycle and natural background behavior

The installed v0.3.0 extension passed a real Edge/live-service work-preset test: two benign text steps were requested and acknowledged, then the final completion marker stopped the loop at **2/3** with **Auftrag abgeschlossen**. The result remains open in the test tab; its screenshot stays local. This proves live work-preset repetition and completion stopping. Browser control did not establish a hidden Edge document, so that run is not counted as hidden-tab evidence.

Natural background acceptance was verified separately in a disposable Chromium process with the packaged v0.3.1 extension. The test uses its own temporary profile and `connectOverCDP({noDefaults:true})` instead of Playwright's default focus overrides. At the actual send event, **document.hidden was true and document.hasFocus() was false**. One continuation was sent, completion stopped further sends, and the default foreground mode stopped on real focus loss before sending. No user browser/profile or live account was used in those fixtures.

Version 0.3.1 also fixes premature stops: cached errors from another conversation are excluded; ordinary retry advice/quoted error explanations are not service failures; completion/user-input markers count only at the final nonempty answer line. **48 unit tests and 17 focused browser checks passed across full/focused runs**, including these regressions and natural visibility acceptance. In the full browser run 16 passed; the foreground test's unnecessary simultaneous-hidden assertion was corrected to require real focus loss and the corrected case passed. The strict hidden/unfocused assertions remain in the background-send test. No overnight endurance or current iOS compilation is claimed.

The existing unpacked extension files and published ZIP were updated to v0.3.1, Cloudflare deployment `e21cc58e-7207-4c57-81fc-74cd09ef36e0`. Edge must reload the unpacked extension and chat page to activate that update; the real-service screenshot records the v0.3.0 run.

## Background task mode — browser extension 0.3.0

The user explicitly requested continuation while using other programs/tabs with the browser open. Version 0.3.0 adds an opt-in background checkbox and a work-prompt preset. Foreground mode remains the default. The preset asks for remaining-task work, verification, and standalone completion/user-input markers; requested markers stop the loop after the answer settles. Navigation, drafts, errors and the 1–50 limit still stop execution. This is assistant-reported completion, not independent task verification.

Executed for v0.3.0: **41/41 unit tests and 15 distinct focused browser checks across full/focused runs**. Unit checks cover hidden/unfocused operation, foreground stopping, pagehide, per-chat background preference and both stop markers. The actual loaded extension additionally passed completion-marker stopping. An initial attempt to assert natural visibility in automation was invalid because Playwright forces focus/visibility. The later natural-visibility and real Edge results are recorded above. The v0.2.4 live result below remains separate.

The v0.3.0 Cloudflare deployment was `28e630f5-959f-4d2f-b3c4-e33fb35b2c72`. For long runs the PC must remain awake and Edge must keep ChatGPT active; sleeping/suspended pages cannot execute. See [background-work.md](background-work.md). No overnight endurance or current iOS build is claimed.

## Live custom-text verification — browser extension 0.2.4

The real Edge test of v0.2.3 found a rich-text issue: paragraph spacing adds line breaks to the editor's rendered `innerText`. The prepared text was therefore rejected before sending (0/2). Version 0.2.4 verifies the actual paragraph boundaries, including intentional empty paragraphs. It then retains an exact snapshot of the prepared draft, so later edits still cancel sending. It also recognizes the observed localized generation control “Stoppen”.

**LIVE WINDOWS / EDGE CUSTOM-TEXT TEST PASSED with installed v0.2.4.** In a dedicated benign text conversation, Reset, a custom message containing multiple lines and an empty paragraph, limit 2 and explicit Start produced two automatic sends. ChatGPT answered both. The panel reached **2 / 2 Fortsetzungen**, displayed **Limit erreicht**, re-enabled Start/text editing and disabled Stop. The completed test tab remains open. The screenshot stays local; no image, conversation URL or conversation content is exported to this repository.

Executed for v0.2.4: **35/35 unit tests, 14/14 focused browser checks**, build, configuration/syntax and packaged-source parity. Browser fixtures cover exact multiline repetition, real HTML paragraphs and blank paragraphs, generation waiting, strict draft editing protection, stop/limits and reload persistence without auto-start. Chromium and WebKit viewport checks remain fixture tests; the installed Edge/live-service result above is separate.

The v0.2.4 Cloudflare deployment was `d09e03c3-a227-48fd-9e6e-e3c609cfdae1`. The shared Safari resource has changed; current iOS packaging has not been rebuilt.

## Custom follow-up field introduced in 0.2.3

The page panel now includes **Automatischer Folgetext**. Enter a message (1–4000 characters, including multiple lines), choose a limit and press Start. After each completed answer the same text is sent again. The field is locked during execution; Stop enables editing, and Reset keeps the text while clearing the counter. The text is saved with the counter and limit in per-conversation browser-tab session storage. Reload never starts sending automatically.

Executed for v0.2.3: **33/33 unit tests** and **12/12 focused browser checks**. The browser checks include the actual unpacked Chromium extension sending the exact multiline message twice, waiting during generation, stopping at 2/2 and restoring the text on reload without restarting. Existing editor/draft and panel-collapse checks passed across Chromium and WebKit iPhone/iPad/MacBook viewport profiles. These were intercepted local fixtures; they did not cover the live rich-text paragraph issue corrected and tested in v0.2.4 above.

The downloadable ZIP and userscript were deployed with Cloudflare version `dbc03f48-a737-4206-9bc3-0d7bdc5994b4`. The shared Safari resource and native privacy wording were updated; v0.2.3 has not been compiled on iOS.

## Prior live-service compatibility fix — 0.2.2

The first manual Windows/Edge test exposed a real compatibility issue not present in the original fixtures: current ChatGPT uses a `data-chatgpt-composer` form, a `data-composer-markdown` contenteditable, assistant bodies marked with `data-markdown-text-style="assistant-message"`, and a localized Send button. Version 0.2.0 therefore stayed at “Warte auf eine ChatGPT-Antwort” even with an assistant answer present.

## Browser extension 0.2.2

- Recognizes those observed semantic attributes while retaining the earlier markup adapter.
- Deduplicates nested assistant bodies and ignores empty response placeholders.
- Supports regular and project conversation paths.
- Detects the current response-loading error and stops safely.
- Waits at most six seconds for the composer Send button to become enabled. Prepared messages cannot be sent after Stop or after the draft/answer changes.
- Synchronizes the displayed counter when the limit changes.
- Displays its version in the panel so the loaded code can be verified.
- Excludes hidden/inert background panes and binds message/composer metadata to the current conversation ID. Cached background answers, drafts, generation controls and errors cannot drive the active loop.

`npm test`: **29/29 passed**, including regressions for current markup, asynchronous Send availability, cancellation, edited drafts, timeout, load errors, recovered answers, project paths, limit display, empty/nested messages and isolation from cached background conversations. Build, syntax/configuration and packaged-source parity checks passed.

The existing Edge extension directory was updated without adding host permissions. Edge must reload an unpacked extension before the new content script is used. Its internal extension-management page cannot be operated through the connected browser API; the user performs that single reload, then the live ChatGPT page is refreshed.

## Evidence boundaries

A dedicated, non-sensitive text test conversation was created. The initial answer loaded after the website's “Antwort neu laden” action. No unrelated conversation was continued and no credentials or conversation contents were sent to the Worker.

**LIVE WINDOWS / EDGE TEST PASSED with the installed v0.2.2 extension.** After resetting the counter, limit 1 and explicit Start produced exactly one automatic continuation in that controlled run. The visible counter changed from `0 / 1` to `1 / 1`; ChatGPT returned the expected test acknowledgment. The panel then displayed “Limit erreicht” and disabled Stop. The test tab was left open with the completed result. The one-message assertion concerns the final controlled run after Reset.

The screenshot is retained locally for the user. No screenshot, conversation URL or conversation content is exported to this repository.

This is a real installed-extension/live-service result, separate from fixture/unit validation. The preceding iOS build and full 35-browser-check evidence in `test-report.md` concern the 0.2.0 baseline; the changed Safari resource has not been rebuilt on iOS in this follow-up. The 0.2.2 automated full browser suite was not rerun; its executed follow-up checks are the 29 unit tests, build/configuration checks and this manual live Edge test.
