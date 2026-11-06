# Windows live test and browser compatibility — 6 November 2026

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

The final automatic continuation test is pending the extension reload and verification of the visible `v0.2.2` panel. It must not be marked successful from the fixture/unit results alone. The preceding iOS build and full 35-browser-check evidence in `test-report.md` concern the 0.2.0 baseline; the changed Safari resource has not been rebuilt on iOS in this follow-up.
