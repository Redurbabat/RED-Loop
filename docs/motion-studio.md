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

The studio does not start cloud jobs, send ChatGPT messages, store credentials or persist input data. Selected scene and all four slider values are encoded in the shareable URL (`scene`, `density`, `depth`, `speed`, `hue`), not saved to local storage. The session-only favorite list has no storage. Clipboard operations show success only after the API resolves, and show an error otherwise. The browser-local preview is not a SwiftUI or Android implementation.

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

Node tests now cover ten unique scenes, preview profile markup, drawing and pointer event disposal. New Playwright coverage selects each platform preview and both scenes and checks for horizontal overflow. Full CI and physical-device verification remain release gates; adding tests does not prove a successful remote run.

## Initialization regression fix (November 2026)

Two startup and slider handlers previously called `querySelector('.ui-loop-swatches button').forEach(...)`. The singular selector returns an element rather than a list and causes a `TypeError` during initial preset application. Both handlers now use `querySelectorAll` through the existing `$$` helper.

The browser suite's common `beforeEach` now applies to **all** cases, including previously standalone PNG-export and device-switching cases, so tests cannot run against an empty page. In addition to browser assertions, `tests/motion-studio-startup.test.mjs` imports the **actual** browser entrypoint in a jsdom-backed HTML document with mocked Canvas and browser APIs; it checks preset hydration, all 10 catalog entries, both swatch paths, updated URL and generated usage code.

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

## Session favorites and quick catalog filter (November 2026)

A dedicated **★ Gemerkte (N)** filter now appears alongside the existing categories. It shows only scenes bookmarked with the existing **Merken** control, including a small star marker and accessible `gemerkt` announcement for each bookmarked catalog entry. The count updates immediately, even if a different category or search filter is currently selected.

- Bookmarks and catalog filters remain **session-only in memory**, with no `localStorage` or server persistence.
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
