# Windows browser extension

RED Loop is packaged as a Manifest V3 developer extension for Microsoft Edge and Google Chrome. It requires no userscript manager.

1. Download **https://red-loop.redurbabat7.workers.dev/red-loop-browser-extension.zip**.
2. Extract the whole ZIP into a permanent folder.
3. Open `edge://extensions` or `chrome://extensions` and enable Developer mode.
4. Choose **Load unpacked / Entpackte Erweiterung laden** and select the extracted folder containing `manifest.json`.
5. Reload an existing `https://chatgpt.com/c/...` conversation. The RED Loop panel appears automatically; automation starts only when you press its Start button.

Enter the text you want repeated in **Automatischer Folgetext**, choose a limit (start with 1), then press **Start**. The extension sends that text after each completed ChatGPT response until the limit is reached or you press Stop. It waits while ChatGPT generates and never sends twice for the same answer. Stop before changing the text. The text and counter are saved for this conversation in the browser tab's session storage; reloading does not restart sending.

Keep the conversation visible and focused. The panel stops for drafts, errors, focus/visibility changes and navigation. No API key, external chat relay, native host or background worker is needed. The toolbar popup provides local activation help; real controls are on the conversation page.

This is a developer package, not a Chrome Web Store or Edge Add-ons release. Managed-browser policy may block unpacked extensions. Keep the extracted folder in place. To update, replace its files and press Reload on the extension-management page. Remove the extension there when finished.

For source development, `npm ci && npm run build` creates `extensions/chromium/` and the downloadable ZIP. The script is synchronized from the canonical `userscripts/red-loop.user.js`; Safari and Chromium receive the same continuation safety logic. The Windows popup has platform-specific activation instructions.

`npm run test:browser -- --project=windows-extension` launches actual Chromium with the unpacked extension and tests its injection, explicit start, bounded send, stop and draft preservation on intercepted local ChatGPT fixtures. This verifies packaging/injection in Chromium; a live ChatGPT account and manual Edge installation still require separate acceptance.
