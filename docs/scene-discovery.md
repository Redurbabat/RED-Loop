# RED Morph — homepage component discovery

## Why

The RED Loop landing page previously included a Motion Studio navigation link, but users had to open a different page **before** they could discover or choose one of the twelve original Canvas effects. RED Morph now surfaces those scenes directly below the homepage introduction and **above** the existing bounded-demo controls.

The component finder is a frontend-only convenience. Cloud jobs, demo state, integration workflows and existing routes are unchanged.

## What users can do

- Search across scene names, categories, descriptions and tags. Terms are case-insensitive and diacritics-tolerant. Multiple words must all match the scene metadata.
- Choose **Alle**, **★ Gemerkte**, **Partikel**, **Lichtfelder** or **Material**, then combine that category with the search box. The number of matches is announced through a polite live status.
- Use **↓** in the search box to focus the first scene; **Enter** with a nonempty query opens its first result. When focused on a card, **↑/↓**, **Home/End** navigate the results. Cards remain ordinary links and therefore support browser open-in-new-tab actions.
- Click a result to open exactly that scene via a URL like `/motion-studio.html?scene=glass-filament`. The URL is built only from scene IDs in the known source catalog.
- **Bookmark or remove an effect directly on its homepage card** using the separate 44×44px star button. The card itself remains an ordinary navigable link; the star button is a sibling, never an interactive element nested inside the link. Saved scenes appear first under **Alle**, or use **★ Gemerkte (N)** to show only bookmarks. The same local bookmarks are visible in Motion Studio and synchronize between browser tabs.
- Recover from an empty search with **Suche zurücksetzen**. If JavaScript is disabled, a regular link to Motion Studio remains available.

The gallery automatically adopts the existing light/dark/system theme. It shows four cards per row on wide screens, three or two on intermediate viewports and a single-column touch-friendly layout on narrow phones. **Each card now contains an original Canvas thumbnail drawn from the canonical scene engine**; the image is decorative and the full card remains an accessible, keyboard-focusable link. Animations do not auto-play, so the homepage gallery adds no continuous motion.

## Data boundaries and architecture

The source of truth is `web/motion-engine.js` (`scenes`). `web/scene-discovery.js` imports those scene definitions and the existing read-only favorites helper; it never duplicates a competing list and **never** calls the cloud API. Search input and category state stay in memory. Favorite IDs are read from the same versioned localStorage key already used by Motion Studio, and the homepage listens to browser `storage` changes to update its saved filter. The gallery does not write storage or track searches. If storage is unavailable, all twelve effects remain browsable.

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

The renderer uses **one shared IntersectionObserver per active search-result set** with a small visibility margin. Offscreen thumbnails do not allocate a Canvas engine until visible; completed thumbnails are unobserved. A search or category change disconnects observation of removed cards before showing replacements. The rendered bitmap remains in the canvas while its card is visible. In browsers without IntersectionObserver, thumbnails render once without visibility-based lazy loading; zero-size canvases are skipped. Zero-size or unavailable canvases skip rendering and retain a still optical-gradient CSS fallback instead of disrupting navigation. This also keeps jsdom test environments safe.

Each preview is marked `aria-hidden="true"`; the scene name, category and description remain the accessible link content. The image itself is not a button, does not intercept touch or keyboard events, and never starts motion. Reduced-motion users receive the same stable static image. The existing responsive four/three/two/one-column layout remains, with a compact thumbnail above the text.

Coverage: `tests/motion-thumbnails.test.mjs` checks lifecycle cleanup, failure fallback, observation, unobserving, older browsers and retries. The existing homepage DOM regression now requires 12 matched, decorative canvases; Playwright checks that visible thumbnails paint, differ between scenes, stay pixel-identical over time, survive filtering and respect reduced motion.

**Release gate:** full hosted CI and visual production/device tests remain unverified until [issue #9](https://github.com/Redurbabat/RED-Loop/issues/9) is resolved.

## Direct homepage bookmark controls (November 2026)

Each homepage gallery entry now has **two distinct actions**: clicking the card opens its original scene in Motion Studio, while pressing the star in its top-right corner immediately bookmarks or unbookmarks it without navigation. The star is a separate native `<button type="button">` **outside** the card's `<a>`, so pointer, keyboard and assistive-technology users are not trapped in invalid nested interactive controls.

The button has a minimum **44 × 44 CSS-pixel touch target**, visible high-contrast focus styling, `aria-pressed`, and a full scene-specific accessible name. A polite status announces whether the bookmark was saved locally, held in memory only (when storage is disabled), or removed. The ★ Gemerkte filter and result ordering update immediately; when a result disappears from the favorites view, keyboard focus returns to search. Otherwise focus stays on the matching newly rendered star button.

This reuses `saveMotionFavorites` and the same **`red-loop.motion-studio.favorites.v1`** key as Motion Studio. No new user data or requests are introduced. As previously, only valid scene IDs are stored and open same-origin tabs receive updates through the native storage event. Bookmarks are local to the same browser storage partition, not synchronized between devices.

Regression coverage extends the real homepage DOM tests and Playwright specs for direct marking/removal, storage fallback, link-versus-button separation, focus preservation, and sync to an already-open Motion Studio tab. The dedicated observer for static thumbnails is disconnected and rebuilt when the card order changes, as with existing filters.

**Current limitation:** hosted CI, Playwright rendering and physical-device verification remain unconfirmed while [issue #9](https://github.com/Redurbabat/RED-Loop/issues/9) is unresolved.

## Side-by-side scene comparison (November 2026)

The homepage now lets users compare the appearance of **up to two original RED Morph studies side by side** without leaving the component finder. Each card has a separate 44px-tall **↔ Vergleichen** button, independent of its scene link and ★ bookmark button. Selecting a study reveals an accessible comparison region above the gallery. A second selection displays both original scenes with their **actual still Canvas thumbnails**, category labels, direct Motion Studio links and individually labelled **Entfernen** buttons. The empty second slot explains how to continue.

The comparison is deliberately constrained to **two studies**: choosing a third replaces the oldest selected study; the result is announced via the existing polite live-status region, and a visible description also explains this behavior. Re-selecting a chosen study removes it. **Vergleich löschen** clears both, hides the panel and restores focus to the catalog search. Removing an item from the comparison restores focus to its corresponding toggle if visible, otherwise to search.

Comparison choice is **in-memory only**. It does not change favorites, write `localStorage`, alter URLs, contact servers, or trigger Cloudflare jobs. Filters and search do not discard selected comparisons. Changes to the comparison update only the comparison region and the `aria-pressed` state of toggles, **not the gallery itself**; thus original lazy thumbnails are not repainted or reallocated merely because the user compares scenes.

The comparison region reuses `observeStaticMotionThumbnails` and the canonical scene engine; only visible static frames are drawn, and each render's observers are disconnected before replacing comparison contents. No animation is automatically started; reduced-motion behavior is unchanged. The panel presents two columns at desktop, tablet and mobile web widths (320px and up). It follows existing light/dark and forced-colors styles.

Tests: `tests/scene-comparison.test.mjs` checks the bounded selection policy, allowlisted scene IDs, immutable inputs, removal and third-scene replacement. `tests/scene-discovery-dom.test.mjs` checks the actual panel, independent controls, stable original card DOM, no storage writes, announced updates and focus after filtering/clearing. `tests/browser/scene-discovery.spec.js` adds static side-by-side bitmap, 320/390/768/1440px layout and keyboard regression cases.

**Validation boundary:** Targeted V8/unit and production-handler tests are separate from full hosted Node/Playwright/iOS verification. GitHub Actions remains blocked without job logs under [issue #9](https://github.com/Redurbabat/RED-Loop/issues/9); no live deployment or real-device rendering is asserted.

## Direct component integration code (November 2026)

Every original RED Morph scene now offers **⌘ Einbau-Code** directly on its homepage card. The action is a separate native button alongside **↔ Vergleichen** and outside the scene link and favorite button. It opens a dedicated, readable and keyboard-accessible inspector above the gallery without navigating to Motion Studio, changing favorites, clearing a comparison or rebuilding any original thumbnail canvases.

The inspector is generated by the **existing** `formatMotionUsage()` in `web/motion-presets.js` with the selected allowlisted scene ID and canonical `defaultMotionSettings`. There is deliberately **no duplicate code template**: the displayed snippet is the same default-configuration example as the Motion Studio's Einbau tab. It demonstrates the module import, creation/configuration of the Canvas engine, explicit user-initiated playback and optional `engine.destroy()` cleanup. Developers must include `motion-engine.js` in their own project and provide `#preview` and `#play` elements (or adjust those selectors).

**Code kopieren** uses the browser's Clipboard API only after the user's click. On success a polite status identifies the exact scene whose code was copied. If Clipboard access is unavailable or denied, the inspector stays open with text selectable and keyboard-focusable, and status explicitly instructs manual copying; it does not falsely claim success. The focused code inspector or the originating card button is restored as appropriate, including when the original card has been filtered away.

The code panel is responsive down to narrow mobile widths and scrolls long source lines inside a bounded, touch-friendly `<pre>`. No analytics, network calls, new storage key, new package or background job is added; the module lives entirely in the browser.

Regression coverage: new jsdom cases in `tests/scene-discovery-dom.test.mjs` verify canonical output, switching scenes, no navigation/storage mutation, source focus and close behavior, filtering and denied Clipboard access; Playwright covers desktop/mobile inspector layout, copy success, errors and scene-specific content. Hosted full-suite and physical-device verification remain blocked by [issue #9](https://github.com/Redurbabat/RED-Loop/issues/9).

## Downloadable original starter package (November 2026)

The existing **⌘ Einbau-Code** inspector now also offers **Starterpaket (.zip)** for each of the twelve original scenes. This fills an important gap: copying the example alone did not provide its companion `motion-engine.js`. The downloadable archive has exactly three UTF-8 files:

- `index.html` — a responsive, keyboard-accessible and reduced-motion-aware Canvas demo, with the selected scene and the **same canonical `formatMotionUsage()` snippet** used by Motion Studio. Animation starts only after an explicit button click; the engine is destroyed on page hide.
- `motion-engine.js` — the **unchanged original same-origin engine** currently served by RED Morph, with no third-party assets or runtime dependencies.
- `README.md` — setup, embed instructions and the requirement to serve ES modules over HTTP. From the unzipped directory run `python3 -m http.server 8000` and open `http://localhost:8000`. Browsers may block relative module imports when opening `index.html` directly with `file://`.

A new independent `web/motion-starter.js` implements the package generator and a small **uncompressed ZIP32** writer with UTF-8 names, CRC32 integrity checks, bounded file sizes and rejection of duplicate or unsafe entry names. No ZIP library, CDN, server-side job, account or uploaded user data is needed. The request for `/motion-engine.js` occurs only after clicking Download, targets the **same origin** and validates the response shape before building the archive.

The chosen scene ID is captured when the download begins; switching scenes while the engine source is loading does not silently change the file name or archive contents. The button shows a busy state and blocks overlapping downloads; success and failure are announced in the accessible status region. Download errors leave the code inspector open and restore the button. Temporary browser object URLs are revoked after 30 seconds, or immediately on failure.

The ZIP can be used for prototypes and component integration across responsive web browsers (iPhone, Android, Windows, MacBook). It is **not a native iOS/Android app package**, nor a deployed service or compiled React component. Exported examples and their engine remain the original RED Morph Canvas implementation.

Regression coverage: `tests/motion-starter.test.mjs` validates ZIP local headers, central directory, all twelve scene starter contents, UTF-8, malformed input and path safety. Homepage jsdom tests cover successful download, network failure and scene-switch race, while Playwright tests cover browser download filename, structure and failure state.

**Deployment/test limitation:** GitHub Actions' hosted Web/iOS runner problem remains open in [issue #9](https://github.com/Redurbabat/RED-Loop/issues/9). The ZIP-format and isolated handler checks are distinct from full end-to-end browser tests and real-device validation.
