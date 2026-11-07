# RED Loop Motion Studio

Open `/motion-studio.html` from the RED Loop dashboard.

## Purpose

An original, self-contained documentation and animation workspace with a searchable sidebar, eight live Canvas 2D studies, desktop/tablet/iPhone preview sizes, configurable motion properties, an integrated source-code view, an always-current setup recipe, validated shareable scene presets and a PNG snapshot export. The interface uses RED Loop's existing brand direction; it does **not** reproduce React Bits Pro's proprietary sources, copy, branding or assets.

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

The engine retains its last visual frame when stopped. It pauses when the document is hidden and disables running motion under `prefers-reduced-motion: reduce`. It caps the backing buffer at approximately 1.6 megapixels, clamps tunable parameters, eases pointer motion while playing and redraws on resize or pointer interaction. It cancels queued frames during cleanup. No playback begins on page load. Users can press Ctrl/Cmd+K or / to focus search, Escape to clear/close, and navigate the catalog with standard native buttons. Primary touch controls, color swatches, category filters and preview-size controls have 44px minimum touch targets. On compact screens, the closed catalog becomes inert and keyboard focus returns to its toggle on dismissal.

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

The **Preset-Link kopieren** action includes the current scene, density, depth, speed and hue. Out-of-range or malformed query values fall back to safe numeric values; unknown scenes return to the first study. The address bar is updated on slider commit, scene selection and reset, and Back/Forward restores both scene and controls. Query serialization preserves unrelated parameters.

Example URL:
`/motion-studio.html?scene=glass-filament&density=72&depth=58&speed=42&hue=255`

The **PNG exportieren** action pauses the canvas and prepares a scene-specific file such as `red-loop-glass-filament.png`. It uses the browser's in-memory Canvas API and temporary object URLs only. The export contains the rendered effect, not the surrounding RED Loop interface. Any failure is reported without claiming a completed download.

The **Einbau** source sample is regenerated from the selected scene and current controls; its source is original and requires no third-party registry subscription. Motion speed changes maintain phase continuity rather than jumping between positions.

## Follow-up validation

Focused local Node execution: `node --test tests/motion-studio.test.mjs tests/motion-presets.test.mjs` — 9 passing tests. Local embedded Chromium checks at 1440, 768 and 390 pixels confirm the dynamic snippet, PNG download, scene selection, sidebar focus restoration, no uncaught JavaScript exceptions and no horizontal overflow. The isolated embedded checks do not prove server routing, copy permissions, native Safari/Android support or deployment correctness.

New Playwright checks on served pages cover preset URL hydration and a PNG download, and repair the prior unsupported `fill()` call on `input[type=range]`. Full GitHub CI execution and physical-device validation remain separate release gates.
