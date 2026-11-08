# RED Morph — homepage component discovery

## Why

The RED Loop landing page previously included a Motion Studio navigation link, but users had to open a different page **before** they could discover or choose one of the ten original Canvas effects. RED Morph now surfaces those scenes directly below the homepage introduction and **above** the existing bounded-demo controls.

The component finder is a frontend-only convenience. Cloud jobs, demo state, integration workflows and existing routes are unchanged.

## What users can do

- Search across scene names, categories, descriptions and tags. Terms are case-insensitive and diacritics-tolerant. Multiple words must all match the scene metadata.
- Choose **Alle**, **★ Gemerkte**, **Partikel**, **Lichtfelder** or **Material**, then combine that category with the search box. The number of matches is announced through a polite live status.
- Use **↓** in the search box to focus the first scene; **Enter** with a nonempty query opens its first result. When focused on a card, **↑/↓**, **Home/End** navigate the results. Cards remain ordinary links and therefore support browser open-in-new-tab actions.
- Click a result to open exactly that scene via a URL like `/motion-studio.html?scene=glass-filament`. The URL is built only from scene IDs in the known source catalog.
- See locally saved favorite scenes first under **Alle**, or use **★ Gemerkte (N)** to show only bookmarked scenes. Existing Motion Studio bookmarks synchronize between same-origin tabs without transferring anything to a server.
- Recover from an empty search with **Suche zurücksetzen**. If JavaScript is disabled, a regular link to Motion Studio remains available.

The gallery automatically adopts the existing light/dark/system theme. It shows four cards per row on wide screens, three or two on intermediate viewports and a single-column touch-friendly layout on narrow phones. **Each card now contains an original Canvas thumbnail drawn from the canonical scene engine**; the image is decorative and the full card remains an accessible, keyboard-focusable link. Animations do not auto-play, so the homepage gallery adds no continuous motion.

## Data boundaries and architecture

The source of truth is `web/motion-engine.js` (`scenes`). `web/scene-discovery.js` imports those scene definitions and the existing read-only favorites helper; it never duplicates a competing list and **never** calls the cloud API. Search input and category state stay in memory. Favorite IDs are read from the same versioned localStorage key already used by Motion Studio, and the homepage listens to browser `storage` changes to update its saved filter. The gallery does not write storage or track searches. If storage is unavailable, all ten effects remain browsable.

Files: `web/index.html` (progressive-enhancement shell), `web/style.css` (scoped optical-glass cards and responsive layout), and `web/scene-discovery.js` (metadata search, safe deep links, and accessible DOM interactions).

## Verification

- Node test cases: `tests/scene-discovery.test.mjs` cover all scene IDs, multiword search, categories, favorite ordering, unknown IDs and safe deep links.
- Real DOM tests: `tests/scene-discovery-dom.test.mjs` exercise the actual homepage markup with jsdom, filtering, keyboard focus, empty states, restored favorite order, storage updates and denied browser storage.
- Browser viewport tests: `tests/browser/scene-discovery.spec.js` verify desktop and 320px/390px/768px phone/tablet layouts, keyboard, deep-link navigation, saved favorites and same-browser-tab updates.

Commands for a connected, functioning CI environment:

```sh
npm ci
npm run build
npm run check
npm test
npx playwright install --with-deps chromium webkit
npm run test:browser
```

**Current limitation:** GitHub Actions runner/job infrastructure remains blocked under [issue #9](https://github.com/Redurbabat/RED-Loop/issues/9), and a merged PR does not establish a green hosted build, production release or physical-device test. The component finder is a responsive *web* feature, not a native iOS/Android UI implementation.

## Lazy, single-frame Canvas thumbnails (November 2026)

The homepage cards now contain actual renderings of their respective **original RED Morph Canvas scenes**. There are no downloaded images, screenshots, licensed design assets or duplicate drawing implementations. `web/motion-thumbnails.js` uses the existing `createMotionEngine` only to draw **one static frame** with the selected scene ID, then immediately calls `destroy()`. No engine is left playing, and no RAF, pointer listener, ResizeObserver or reduced-motion listener remains attached to the thumbnail.

The renderer uses **one shared IntersectionObserver per active search-result set** with a small visibility margin. Offscreen thumbnails do not allocate a Canvas engine until visible; completed thumbnails are unobserved. A search or category change disconnects observation of removed cards before showing replacements. The rendered bitmap remains in the canvas while its card is visible. In browsers without IntersectionObserver, visible thumbnails render once directly. Zero-size or unavailable canvases skip rendering and retain a still optical-gradient CSS fallback instead of disrupting navigation. This also keeps jsdom test environments safe.

Each preview is marked `aria-hidden="true"`; the scene name, category and description remain the accessible link content. The image itself is not a button, does not intercept touch or keyboard events, and never starts motion. Reduced-motion users receive the same stable static image. The existing responsive four/three/two/one-column layout remains, with a compact thumbnail above the text.

Coverage: `tests/motion-thumbnails.test.mjs` checks lifecycle cleanup, failure fallback, observation, unobserving, older browsers and retries. The existing homepage DOM regression now requires 10 matched, decorative canvases; Playwright checks that visible thumbnails paint, differ between scenes, stay pixel-identical over time, survive filtering and respect reduced motion.

**Release gate:** full hosted CI and visual production/device tests remain unverified until [issue #9](https://github.com/Redurbabat/RED-Loop/issues/9) is resolved.
