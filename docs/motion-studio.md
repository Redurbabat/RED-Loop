# RED Loop Motion Studio

Open `/motion-studio.html` from the RED Loop dashboard.

## Purpose

An original, self-contained documentation and animation workspace with a searchable sidebar, ten live Canvas 2D studies, MacBook/Windows/tablet/iPhone/Android responsive preview widths, configurable motion properties, an integrated source-code view, an always-current setup recipe, validated shareable scene presets and a PNG snapshot export. The interface uses RED Loop's existing brand direction; it does **not** reproduce React Bits Pro's proprietary sources, copy, branding or assets.

Reference for the interaction pattern: https://pro.reactbits.dev/docs/components/spectral-drape?browse=components (visual research only; no premium code copied).

## Original effect catalog

- Spectral Fold — folded depth field composed of dots
- Chromatic Current — layered, flowing lines
- Orbit Wake — elliptical particle orbits
- Satin Ridges — softly lit virtual cloth contour
- Signal Matrix — point grid responding to pointer proximity
- Red Resonance — concentric controlled signal rings
- Glass Filament — layered optical filament ribbons with restrained lens glow
- Iris Caustics — refracted, responsive elliptical light contours
- Prism Veil — translucent interleaved optical glass panels with directional reflection edges
- Vector Bloom — responsive radial vector fields and controlled central bloom

## Architecture

- `web/motion-studio.html`: isolated, semantic studio UI, no inline scripts
- `web/motion-studio.css`: namespaced responsive styles and light/dark/system preferences
- `web/motion-studio.js`: catalog filtering, state, keyboard search, clipboard, sliders, device widths and code tabs
- `web/motion-engine.js`: zero-dependency Canvas 2D renderer with `createMotionEngine(canvas, options)`
- `web/motion-presets.js`: pure URL validation, serialization and code-snippet formatting
- `tests/motion-studio.test.mjs`: Node tests for metadata, document structure and engine control semantics
- `tests/motion-presets.test.mjs`: Node tests for safe deep-link parsing, serialization and code output

### Reusable engine API

```js
import {createMotionEngine} from './motion-engine.js';
const engine=createMotionEngine(canvas,{onStateChange:running=>{}});
engine.configure({scene:'spectral-fold',density:58,depth:58,speed:42,hue:340});
engine.setPlaying(true); // only after a user explicitly starts animation
engine.setPlaying(false);
engine.destroy();
```

The engine retains its last visual frame when stopped. It pauses when the document is hidden and disables running motion under `prefers-reduced-motion: reduce`. It caps the backing buffer at approximately 1.6 megapixels, clamps tunable parameters, eases pointer motion while playing and redraws on resize or pointer interaction. It cancels queued frames during cleanup. No playback begins on page load. Users can press Ctrl/Cmd+K or / to focus search, Escape to clear/close, and navigate the catalog with standard native buttons. Primary touch controls, color swatches, category filters and preview-size controls have 44px minimum touch targets. On compact screens, the closed catalog becomes inert and keyboard focus returns to its toggle on dismissal. Touch pointer cancellation releases the scene focus cleanly.

## Preservation inventory

| Existing area | Decision | Reason |
| --- | --- | --- |
| `web/index.html` dashboard and navigation | KEEP + additive link | Preserves all existing app controls and routes |
| `web/app.js` local loop and CloudConsole | KEEP | Safety-critical UI logic unchanged |
| `web/style.css` existing tokens | KEEP | Existing workspace design unchanged |
| `userscripts/`, `extensions/`, `ios/` | KEEP | Existing runtime and distribution unaffected |
| Motion Studio | New experimental gallery | Isolated from cloud execution and real ChatGPT integration |
| Premium React Bits Pro sources | Not imported | Requires separate legitimate licensing and compatibility review |

## Safety & quality

The studio does not start cloud jobs, send ChatGPT messages, or store credentials. Selected scene and four slider values are encoded in the shareable URL (`scene`, `density`, `depth`, `speed`, `hue`) and are not saved to local storage. **Only bookmarked scene IDs are stored locally in the current browser** for quick access across reloads; search queries are never persisted. Clipboard operations show success only after the API resolves, and show an error otherwise. The browser-local preview is not a SwiftUI or Android implementation.

### Tests and verification

```sh
npm run build
npm run check
npm test
npm run test:browser
```

Before merge, inspect the studio at 390px, 768px and 1440px, using mouse/touch and keyboard, light/dark and reduced motion. Test code-tab loading and clipboard permissions with an HTTPS origin.

Local pre-commit validation performed for this contribution: `node --check` on both modules and `node --test tests/motion-studio.test.mjs` (five passing tests). The full repository build, all tests, device screenshots and deployed Worker verification have **not** been run in this session.

## November 2026 motion refinement

- Two new scenes are original implementations, without copying third-party visual assets.
- Canvas uses a roughly 1.6MP buffer budget to bound high-DPI memory and retains readable static frames.
- While playing, pointer position moves toward the target using frame-time-based easing; when paused, pointer response remains direct without starting a perpetual loop.
- Responsive mobile catalog uses `inert` when closed and restores focus to the catalog control after selection/Escape.
- Local targeted tests: `node --test tests/motion-studio.test.mjs` — 5 passed; `node --check` for both motion modules — passed. Full repository CI and physical-device validation must be checked separately.

## Shareable presets and PNG snapshots

The **Preset-Link kopieren** action includes the current scene, density, depth, speed and hue. Out-of-range or malformed query values fall back to safe numeric values; unknown scenes return to the first study. The address bar is updated on slider commit, scene selection and reset, and Back/Forward restores both scene and controls. Share links intentionally contain only the five public visual parameters. Arbitrary query parameters (for example `token`, `state` or `redirect`) and URL fragments are discarded rather than forwarded to another person.

Example URL:
`/motion-studio.html?scene=glass-filament&density=72&depth=58&speed=42&hue=255`

The **PNG exportieren** action pauses the canvas and prepares a scene-specific file such as `red-loop-glass-filament.png`. It uses the browser's in-memory Canvas API and temporary object URLs only. The export contains the rendered effect, not the surrounding RED Loop interface. Any failure is reported without claiming a completed download.

The **Einbau** source sample is regenerated from the selected scene and current controls; its source is original and requires no third-party registry subscription. Motion speed changes maintain phase continuity rather than jumping between positions.

## Follow-up validation

Focused local Node execution: `node --test tests/motion-studio.test.mjs tests/motion-presets.test.mjs` — 9 passing tests. Local embedded Chromium checks at 1440, 768 and 390 pixels confirm the dynamic snippet, PNG download, scene selection, sidebar focus restoration, no uncaught JavaScript exceptions and no horizontal overflow. The isolated embedded checks do not prove server routing, copy permissions, native Safari/Android support or deployment correctness.

New Playwright checks on served pages cover preset URL hydration and a PNG download, and repair the prior unsupported `fill()` call on `input[type=range]`. Full GitHub CI execution and physical-device validation remain separate release gates.

## Cross-device preview improvements (November 2026)

The studio provides **five browser viewport presets**: MacBook (wide rounded stage), Windows (wide squarer stage), tablet (up to 700px), iPhone (up to 355px) and Android (up to 390px). Device choice is a visual width and frame simulation, not a native operating-system runtime. Its list scrolls horizontally on narrow screens without growing the document width, and buttons remain at least 44px high.

**Prism Veil** and **Vector Bloom** use original Canvas 2D geometry with no external shaders, premium assets or additional dependencies. Both are static at rest and react to pointer/touch input or explicit playback. Pointer-cancel is handled to avoid stale touch focus during scroll cancellation. Motion remains disabled by the system's reduced-motion setting.

Node tests now cover twelve unique scenes, preview profile markup, drawing and pointer event disposal. New Playwright coverage selects each platform preview and both scenes and checks for horizontal overflow. Full CI and physical-device verification remain release gates; adding tests does not prove a successful remote run.

## Initialization regression fix (November 2026)

Two startup and slider handlers previously called `querySelector('.ui-loop-swatches button').forEach(...)`. The singular selector returns an element rather than a list and causes a `TypeError` during initial preset application. Both handlers now use `querySelectorAll` through the existing `$$` helper.

The browser suite's common `beforeEach` now applies to **all** cases, including previously standalone PNG-export and device-switching cases, so tests cannot run against an empty page. In addition to browser assertions, `tests/motion-studio-startup.test.mjs` imports the **actual** browser entrypoint in a jsdom-backed HTML document with mocked Canvas and browser APIs; it checks preset hydration, all 12 catalog entries, both swatch paths, updated URL and generated usage code.

This is a regression repair, not a new animation or native-client feature. Complete GitHub Actions, deployed-site and physical-device checks remain the independent quality gates. Do not treat a successful GitHub merge as a deployment.

## Privacy hardening of preset links (November 2026)

The copied preset URL is built from the current origin and pathname, not the full incoming URL. The serializer has an explicit five-field allowlist: `scene`, `density`, `depth`, `speed`, `hue`. Extra query values, authentication-looking fields and hash fragments are **not included** in copied links or in URL updates after user changes. This avoids accidentally copying unknown URL parameters that might contain private data. Malformed scene identifiers are replaced with the default scene. Existing visual settings are still restored when opening a valid deep link.

Regression coverage: pure Node preset tests (including extra parameter rejection and scene sanitization), entrypoint startup DOM test (URL cleanup after editing a slider), and a real browser test that intercepts clipboard text and verifies the shared URL has no unrelated query values or fragment. The fixes do not alter cloud tokens or job state; they apply only to the public Motion Studio sharing feature.

## Accessible compact catalog dialog (November 2026)

At browser widths **850px and below**, the catalog behaves as an explicit modal dialog:

- Opening the catalog places focus in search, assigns `role="dialog"` / `aria-modal="true"`, shows a dark click-away backdrop and prevents scrolling of the underlying page.
- The main workspace, top navigation and inspector become `inert` while the dialog is open. Keyboard Tab and Shift+Tab wrap between the first and last catalog controls, with no focus escaping to the blocked page.
- The dialog has a visible **Schließen** control with a 44px touch target. It also closes through Escape, choosing a component, or tapping the backdrop; focus returns to the catalog trigger on compact screens.
- When the responsive breakpoint changes to desktop, modal state, inertness and backdrop are cleaned up. On desktop the catalog remains a standard, always-visible complementary sidebar; no modal role is applied.
- Reduced-transparency users receive a more opaque backdrop, and the existing reduced-motion preference disables drawer transitions.

Regression coverage includes HTML/control assertions and Playwright scenarios for focus wrap, inert background, closing, outside taps and focus restoration on compact viewports. Since GitHub Actions is currently blocked (issue #9), the new browser tests are committed but their successful hosted execution must still be confirmed.

## Favorites and quick catalog filter (November 2026)

A dedicated **★ Gemerkte (N)** filter now appears alongside the existing categories. It shows only scenes bookmarked with the existing **Merken** control, including a small star marker and accessible `gemerkt` announcement for each bookmarked catalog entry. The count updates immediately, even if a different category or search filter is currently selected.

- Bookmarked scene IDs are saved locally in the browser using a versioned `localStorage` key; category and search filters remain session-only. No bookmarks are sent to any server, and private browsing or disabled storage gracefully falls back to in-memory bookmarks.
- Favoriting/unfavoriting does **not** reselect the scene, reset its parameters, change its URL or stop a running animation. Switching to a different scene still pauses playback as before.
- The favorites filter combines with the existing text search. When no scenes are saved, it displays a specific explanation with the `Merken` action; an ordinary unmatched search retains the original no-results message.
- Both desktop and compact-screen catalogs use the same category and count state. The mobile dialog/accessibility behavior from PR #13 is unchanged.

Regression tests exercise the real entrypoint in jsdom (bookmark count, exact filtered entries, empty state and uninterrupted playback) and Playwright at the configured viewport profiles. The GitHub-hosted CI runner remains blocked under [issue #9](https://github.com/Redurbabat/RED-Loop/issues/9); a merged test is not evidence that CI or production deployment passed.

### Additional catalog startup regression repaired

While exercising the favorites filter, the catalog's **existing** filter-button update was found to call `$('#ui-loop-filters button').forEach(...)`. This uses the one-element `querySelector` helper and throws a `TypeError`, including during initial module setup. It now uses the iterable `$$` (`querySelectorAll`) helper. A separate unit-source regression explicitly rejects this class of erroneous singleton-selector loop, and the real-entrypoint jsdom smoke test now exercises filter initialization and favorites state. This is distinct from the earlier swatch-selector repair.

Validation for this change: production catalog source executed in a controlled JavaScript DOM stub with **15 passing assertions** covering initialization, bookmarked filtering, search combination, empty states, count updates, accessible star labels and no scene reselection; JavaScript syntax of the studio, DOM startup test and browser spec checked. Complete Node/Playwright CI execution remains unverified under issue #9.

## Keyboard-accessible Canvas focus (November 2026)

Previously, the light field responded to mouse/touch pointer movement only. The preview Canvas is now keyboard-focusable (`tabindex="0"`) and references short visible and screen-reader-accessible instructions. Users can:

- Tab to the Canvas, then use **arrow keys** to move the optical focus. Holding **Shift** uses a larger increment. **Home / Pos1** resets the field to its neutral position.
- Keep focus in the preview without the page scrolling when using those specific keys; modified shortcuts (Ctrl/Alt/Meta + arrow) and other keys remain available to the browser.
- Use the same interaction across MacBook/Windows keyboard use, iPad hardware keyboards and Android/iPhone hardware keyboard setups where supported. It does not require pointer input or a native app.

Keyboard focus is shown with a controlled contrast-visible outline, also under forced-colors mode. The canvas retains `role="img"` for its descriptive output and `aria-keyshortcuts` / `aria-describedby` to advertise the interaction. Keyboard movement redraws the *current static frame* and **never starts playback**; `prefers-reduced-motion` remains respected. Blur resets the active pointer influence, and `destroy()` removes the new keyboard and blur listeners.

Validation: deterministic execution of the **branch's actual Canvas engine** in a fake drawing context showed that ArrowRight changes thousands of dot positions, Home restores the original drawing, modifier shortcuts are ignored, no playback starts, and all event listeners/RAF handles are cleaned up. A separate unit test exercises keyboard redraw, Home, modifiers and teardown, and Playwright checks the rendered image and keyboard focus. Full hosted CI and production-device confirmation remain blocked by [issue #9](https://github.com/Redurbabat/RED-Loop/issues/9).

## Current-frame PNG export reliability (November 2026)

The **PNG exportieren** action now explicitly pauses playback, refreshes the current canvas backing size from its actual preview element, cancels any deferred stale redraw, and **renders the latest scene synchronously** before the browser calls `canvas.toBlob('image/png')`.

Previously, changing a scene or device queued its canvas redraw for the next animation frame. Clicking export immediately after such a change could capture the *previous* scene or previous-sized buffer instead of the current selection. The export-specific `engine.renderForExport()` method returns `false` when the canvas is hidden, destroyed or still playing, so the UI reports a failure instead of silently exporting an invalid capture.

The renderer retains its ~1.6-megapixel canvas backing-buffer limit. Exporting does not restart motion and is still a PNG of the Canvas content **only**, not the surrounding HTML overlay, labels or controls. Normal idle rendering remains animation-frame scheduled for responsiveness.

Regression coverage:
- `tests/motion-snapshot.test.mjs`: exercise the actual engine without completing any scheduled animation frame; verify synchronous painting, current scene, updated iPhone-style dimensions, frame cancellation, paused state and cleanup.
- `tests/browser/motion-studio.spec.js`: download PNG after choosing Vector Bloom and iPhone/Android preview sizes, inspect actual PNG dimensions and check that distinct previews produce distinct image bytes on Chromium.
- Full hosted CI and physical-device export verification remain separate release gates while [issue #9](https://github.com/Redurbabat/RED-Loop/issues/9) is open.

## Reliable asynchronous PNG encoding (November 2026)

PNG snapshots now have two distinct, explicit stages: synchronous `engine.renderForExport()` paints the currently selected frame, and asynchronous `encodeCanvasPng()` asks the browser to encode those pixels. The **requested scene ID is frozen before the asynchronous callback starts**. If the user selects another scene while encoding finishes, the download filename still correctly identifies the captured scene rather than the newly selected one.

- A maximum **12-second encoding wait** prevents a stalled `toBlob` callback from permanently disabling the export control.
- Unsupported encoding, `null` blobs, unexpected MIME formats and browser exceptions produce the existing error message. Late or duplicate callbacks cannot settle the same export twice.
- While encoding is in progress the button is disabled, marked `aria-busy="true"` and displays a temporary progress label. Its original label and enabled state are restored in `finally` on either success or failure.
- Download links are removed after activation, and their object URLs retain the existing delayed revocation period.

Regression coverage: `tests/motion-export.test.mjs` tests valid PNG encoding, unsupported/null/wrong-format results, exceptions, bounded wait, late and duplicate callbacks. Playwright checks that delayed encoding followed by navigation still downloads the **original** scene's filename, and verifies that a failed export unlocks the button.

Validation: the actual feature-branch encoding helper and actual click handler were executed with controlled asynchronous callbacks, producing **13 passing assertions**, including a forced timeout, delayed scene switch and both error/success cleanup paths. The hosted CI/real-device checks remain unverified while [issue #9](https://github.com/Redurbabat/RED-Loop/issues/9) is open.

## Keyboard-first catalog discovery (November 2026)

The sidebar search now supports rapid keyboard navigation across the ten motion studies on **desktop and compact mobile/tablet dialogs** without creating a separate command palette:

- Use `/` or `Ctrl/Cmd+K` to focus the catalog search (existing shortcut). The new visible search hint explains that **↓** focuses the first matching scene, **↑** the last, and **Enter** opens the first match when a query is present.
- Once a scene button is focused, **↑/↓** move through adjacent results. **Home/End** jump to the first/last entry. Moving up from the first entry or down from the last returns to the search input.
- Selecting a scene rebuilds the filtered catalog. The new event handling restores focus to the **newly rendered selected button on desktop** rather than dropping focus to the document body. On compact screens it closes the dialog *before* rebuilding, restoring focus to the **Katalog** trigger.
- Modified cursor shortcuts (Ctrl, Alt, Meta) are left to the browser. When no scene matches, arrow keys do not steal input focus.
- A polite, atomic, screen-reader status announces `0 Komponenten gefunden`, `1 Komponente gefunden`, etc. The input is associated with the keyboard hint via `aria-describedby`. Existing focus outlines, reduced motion and accessible mobile dialog behavior remain unchanged.

This is an incremental, dependency-free enhancement of the existing catalog. It does not call a cloud service, save search history or introduce user tracking. The existing URL preset and locally stored favorites filter continue to work.

Validation: the **actual catalog event handlers** extracted from the feature branch passed **27 deterministic runtime checks**, covering first/last navigation, Home/End, matching and empty search, Enter activation, desktop and mobile focus restoration and modified shortcuts. The actual entrypoint jsdom smoke test, source-regression checks and Playwright viewport tests were extended. Full hosted CI and physical device verification remain blocked by [issue #9](https://github.com/Redurbabat/RED-Loop/issues/9).

## Accessible Preview / Code / Einbau tabs (November 2026)

The three view controls now follow the **WAI-ARIA tab / tablist / tabpanel** interaction pattern instead of being unrelated pressed buttons.

- `Preview`, `Code`, and `Einbau` each expose `role="tab"`, `aria-selected` and `aria-controls` linked to a corresponding labelled `role="tabpanel"`. Only the active panel is visible.
- The active tab is the **only** view button in the normal Tab sequence (`tabindex="0"`); the other two receive `tabindex="-1"`.
- With keyboard focus on a tab: **Left/Right Arrow** switches to the adjacent tab (wrapping at either end), and **Home/End** jumps to the first/last. Ctrl/Alt/Meta modifiers are not intercepted. Click/touch selection still works on mobile and desktop.
- Switching away from Preview pauses animation; returning to Preview does **not** automatically restart motion. Selecting Code loads and displays the locally served engine as before.
- The existing accessible focus outline and reduced-motion rules remain in effect. No external UI framework or React Bits Pro code is required.

Regression tests cover semantic HTML/CSS, actual entrypoint initialization and keyboard switching, active/inactive panel visibility, a single tab stop, and paused playback. The full browser/iOS test suites remain separately blocked by GitHub Actions infrastructure [issue #9](https://github.com/Redurbabat/RED-Loop/issues/9).

## Persistent local favorites (November 2026)

The **★ Gemerkte (N)** view now restores selected scene bookmarks after refreshing or reopening the Motion Studio in the same browser. This makes frequently used visual components easier to locate across sessions, without using an account or sending data to a backend.

- Storage: the versioned key `red-loop.motion-studio.favorites.v1` holds a JSON array of **valid scene IDs only**. It does **not** contain scene settings, query text, copied links, authentication data, or user content. Removing the last bookmark removes the key.
- On startup, malformed JSON, invalid shapes, duplicate identifiers, and deleted/unknown scene IDs are discarded. Only IDs present in the current ten-scene catalog are accepted. There is no migration from earlier session-only favorites because they were never stored.
- If access to `localStorage` throws (private browsing or browser policy), the catalog still works in memory, with no startup crash and an honest **In dieser Sitzung gemerkt** notice. When persistence succeeds, the toast says **Lokal im Browser gemerkt**.
- The category filter, accessible bookmarks, canvas playback, and preset URL behavior are unchanged. No new packages, analytics, tracking, or cloud integration were added. Users can remove individual bookmarks with **Gemerkt** and can clear all data through browser site-data settings.

Regression coverage: pure `tests/motion-favorites.test.mjs` verifies round-trip, refresh, removal, storage-disabled fallback, invalid input, and strict ID-only serialization. The real-entrypoint jsdom smoke test checks that toggling the favorite writes/removes the key, and Playwright tests cover an actual reload and simulated denied-storage scenario.

**Release limitations:** full hosted Web/iOS CI and production-device validation are not confirmed while [issue #9](https://github.com/Redurbabat/RED-Loop/issues/9) remains unresolved.

## Live bookmark synchronization across open tabs (November 2026)

When RED Morph is open in multiple tabs of the same browser profile, **bookmark changes now appear in the other tabs immediately**. This also covers removal of the last bookmark and clearing browser site storage. Previously, an already-open tab would keep its outdated in-memory favorites until reloading.

The client listens to the browser's same-origin `storage` event and responds only to the versioned bookmark key `red-loop.motion-studio.favorites.v1` (or a storage-wide clear event). Unrelated storage keys and other storage areas are ignored. The receiving tab validates the incoming IDs against the catalog, deduplicates them and updates its ★ Gemerkte count, active-scene bookmark control and visible category results.

To avoid disturbing keyboard users, a catalog button that currently has focus is replaced with the corresponding new button and re-focused. If that bookmarked scene disappears from a filtered list, focus safely moves to the search input. A remote change **does not call scene selection, restart/pause animation, navigate or write back to storage**, so it cannot create event loops. Changes that do not alter membership cause no catalog rebuild.

No polling, analytics, cloud API, account synchronization or new storage keys are introduced. Disabled browser storage still uses the existing in-memory fallback. Synchronization operates only among tabs sharing the same browser storage partition; it is not synchronization between devices or browsers.

Regression coverage includes `tests/motion-favorites.test.mjs` (cross-tab additions, removals, clear, irrelevant events, malformed IDs and unchanged membership), real-entrypoint startup checks, and Playwright tests with two pages in the same browser context. Hosted CI and physical-device tests remain unverified while [issue #9](https://github.com/Redurbabat/RED-Loop/issues/9) is unresolved.

## Two new original optical studies (November 2026)

RED Morph expands its independent Canvas library from ten to **twelve** original studies. Both new entries use the existing renderer infrastructure and its safe settings, rather than copied third-party implementations or licensed component assets.

**Aurora Threads** (`aurora-threads`, Lichtfelder) draws multiple softly layered, deterministic luminous threads. The geometry changes with focus position, material depth, scene hue and animation time. At rest it presents a still woven-light surface, without a permanent glow animation or background timer.

**Mercury Droplets** (`mercury-droplets`, Material) uses original radial-gradient droplet geometry, restrained edge highlights and deterministic spatial placement to suggest reflective liquid metal. The droplets respond to pointer focus, depth and hue. It reuses the same high-DPI, bounded Canvas backing buffer and pause/reduced-motion handling as the original library.

Both studies are available through the Motion Studio catalog, category and name search, copyable usage format, URL deep links, session/profile favorites, keyboard Canvas interaction, iPhone/Android/tablet/MacBook/Windows responsive web previews, local PNG export and the lazy homepage thumbnails. Their metadata lives in `web/motion-engine.js`; there are no separate or diverging catalog lists.

**Regression verification:** `tests/motion-original-studies.test.mjs` executes the canonical Canvas code in a controlled drawing context for both studies, validates distinct finite geometry, pointer and configuration response, reduced-motion support and complete listener/RAF teardown. Existing catalog and homepage tests were adjusted to twelve studies, and Playwright scenarios were added for scene URLs, thumbnails, material search, actual Canvas dimensions, favorites and compact catalog behavior. A full green hosted CI or real-device visual run is **not** established while [issue #9](https://github.com/Redurbabat/RED-Loop/issues/9) remains open.

## Configured Starter ZIP from Motion Studio (November 2026)

In addition to the existing default starter ZIP on the homepage, Motion Studio's **Einbau** tab now offers **↓ Starter-ZIP mit Einstellungen**. This downloads a **ready-to-run original Canvas web project using the current selected scene and all four live slider values** (density, depth, speed and hue), instead of resetting the example to homepage defaults.

The archive reuses the same dependency-free `web/motion-starter.js` generator introduced for homepage downloads. `createMotionStarterFiles(sceneId, engineSource, settings?)` now accepts optional settings and normalizes them with `normalizeMotionSettings()`, the same setting limits used by shared preset URLs and integration code. Homepage calls without settings remain backwards-compatible and still use `defaultMotionSettings`.

The result contains exactly three files: `index.html` (responsive, keyboard-accessible Canvas demo configured to the chosen scene/settings), `motion-engine.js` (unchanged same-origin original source) and `README.md` (HTTP local-server run instructions plus the chosen values). In Motion Studio, choose a scene, adjust any four sliders and open the **Einbau** tab to export. The current settings appear in the displayed code and are also embedded in the downloaded `index.html`; they are not sent to a cloud job.

The click handler captures the complete configuration **before** fetching the engine asynchronously. Moving sliders or switching scenes during the download does not change the file name or contents. The same-origin engine request has a **12-second AbortController timeout**; the download button is disabled with `aria-busy` during generation and prevents overlapping requests. Errors leave the code usable and announce failure rather than success. Temporary browser object URLs are revoked after 30 seconds on success or immediately on error.

For example, choosing **Mercury Droplets** with `density=83, depth=11, speed=7, hue=275` produces `red-morph-mercury-droplets-custom-starter.zip`, and its HTML initializes exactly those values. Extract the ZIP, run `python3 -m http.server 8000` in the extracted directory and open `http://localhost:8000`.

The responsive output is a **web starter**, not a compiled native iOS/Android app or a React component package. No cloud calls, accounts, new dependencies, external artwork or duplicated component engines are added.

Regression coverage: `tests/motion-starter.test.mjs` adds customized-configuration round trips, bounds normalization and backwards compatibility; `tests/browser/motion-studio.spec.js` tests direct slider edits, real ZIP bytes, filename/contents and unavailable-engine recovery. Focused execution of the actual studio download handler separately checks frozen selection, progress state, denied request, timeout, cleanup and double-click prevention. Hosted Web/iOS CI and physical-device verification remain unconfirmed while [issue #9](https://github.com/Redurbabat/RED-Loop/issues/9) is open.
