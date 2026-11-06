# Windows live test and browser compatibility — 6 November 2026

## Custom follow-up text — browser extension 0.2.3

The page panel now includes **Automatischer Folgetext**. Enter a message (1–4000 characters, including multiple lines), choose a limit and press Start. After each completed answer the same text is sent again. The field is locked during execution; Stop enables editing, and Reset keeps the text while clearing the counter. The text is saved with the counter and limit in per-conversation browser-tab session storage. Reload never starts sending automatically.

Executed for v0.2.3: **33/33 unit tests** and **12/12 focused browser checks**. The browser checks include the actual unpacked Chromium extension sending the exact multiline message twice, waiting during generation, stopping at 2/2 and restoring the text on reload without restarting. Existing editor/draft and panel-collapse checks passed across Chromium and WebKit iPhone/iPad/MacBook viewport profiles. These are intercepted local fixtures, separate from live-service testing. The source was installed in the existing Edge extension directory; the real Edge test below remains evidence for v0.2.2 until the updated extension is reloaded and tested.

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
