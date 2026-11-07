# RED Loop Motion Studio

Open `/motion-studio.html` from the RED Loop dashboard.

## Purpose

An original, self-contained documentation and animation workspace with a searchable sidebar, six live Canvas 2D studies, desktop/tablet/iPhone preview sizes, configurable motion properties, an integrated source-code view, a copyable setup recipe, and accessible controls. The interface uses RED Loop's existing brand direction; it does **not** reproduce React Bits Pro's proprietary sources, copy, branding or assets.

Reference for the interaction pattern: https://pro.reactbits.dev/docs/components/spectral-drape?browse=components (visual research only; no premium code copied).

## Original effect catalog

- Spectral Fold — folded depth field composed of dots
- Chromatic Current — layered, flowing lines
- Orbit Wake — elliptical particle orbits
- Satin Ridges — softly lit virtual cloth contour
- Signal Matrix — point grid responding to pointer proximity
- Red Resonance — concentric controlled signal rings

## Architecture

- `web/motion-studio.html`: isolated, semantic studio UI, no inline scripts
- `web/motion-studio.css`: namespaced responsive styles and light/dark/system preferences
- `web/motion-studio.js`: catalog filtering, state, keyboard search, clipboard, sliders, device widths and code tabs
- `web/motion-engine.js`: zero-dependency Canvas 2D renderer with `createMotionEngine(canvas, options)`
- `tests/motion-studio.test.mjs`: Node tests for metadata, document structure and engine control semantics

### Reusable engine API

```js
import {createMotionEngine} from './motion-engine.js';
const engine=createMotionEngine(canvas,{onStateChange:running=>{}});
engine.configure({scene:'spectral-fold',density:58,depth:58,speed:42,hue:340});
engine.setPlaying(true); // only after a user explicitly starts animation
engine.setPlaying(false);
engine.destroy();
```

The engine retains its last visual frame when stopped. It pauses when the document is hidden and disables running motion under `prefers-reduced-motion: reduce`. It caps device pixel ratio, clamps tunable parameters and redraws on resize or pointer interaction. No playback begins on page load. Users can press Ctrl/Cmd+K or / to focus search, Escape to clear/close, and navigate the catalog with standard native buttons. Touch targets are designed for at least 44px where actionable.

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

The studio does not start cloud jobs, send ChatGPT messages, store credentials or persist input data. Bookmarked study selection is stored in a shareable URL; the session-only favorite list has no storage. Clipboard operations show success only after the API resolves, and show an error otherwise. The browser-local preview is not a SwiftUI or Android implementation.

### Tests and verification

```sh
npm run build
npm run check
npm test
npm run test:browser
```

Before merge, inspect the studio at 390px, 768px and 1440px, using mouse/touch and keyboard, light/dark and reduced motion. Test code-tab loading and clipboard permissions with an HTTPS origin.

Local pre-commit validation performed for this contribution: `node --check` on both modules and `node --test tests/motion-studio.test.mjs` (three passing tests). The full repository build, all tests, device screenshots and deployed Worker verification have **not** been run in this session.
