# Windows browser extension

RED Loop is packaged as a Manifest V3 developer extension for Microsoft Edge and Google Chrome. It requires no userscript manager.

1. Download **https://red-loop.redurbabat7.workers.dev/red-loop-browser-extension.zip**.
2. Extract the whole ZIP into a permanent folder.
3. Open `edge://extensions` or `chrome://extensions` and enable Developer mode.
4. Choose **Load unpacked / Entpackte Erweiterung laden** and select the extracted folder containing `manifest.json`.
5. Reload an existing `https://chatgpt.com/c/...` conversation. The RED Loop panel appears automatically; automation starts only when you press its Start button.

Enter the text you want repeated in **Automatischer Folgetext**, choose a limit (start with 1), then press **Start**. The extension sends that text after each completed ChatGPT response until the limit is reached or you press Stop. It waits while ChatGPT generates and never sends twice for the same answer. Stop before changing the text. The text and counter are saved for this conversation in the browser tab's session storage; reloading does not restart sending.

For ongoing task work, select **Text für offene Aufgaben laden**. The preset asks ChatGPT to work on remaining tasks and finish with a completion or user-input marker; the extension stops when that marker appears on its own line. It is an assistant-reported completion condition, not independent verification.

Enable **Auch im Hintergrund weiterarbeiten** before Start to use other programs or browser tabs. Leave this chat/browser open and the PC awake. Without this option, focus/visibility changes still stop the loop. Drafts, errors, navigation and the limit stop both modes. In Edge, add `https://chatgpt.com` under **Settings → System and performance → Performance → Always keep these sites active** for long runs; sleeping tabs pause the page ([Microsoft guidance](https://support.microsoft.com/en-us/edge/learn-about-performance-features-in-microsoft-edge)). The extension cannot run during PC sleep, page suspension or browser closure. No API key, external chat relay, native host or background worker is needed.

This is a developer package, not a Chrome Web Store or Edge Add-ons release. Managed-browser policy may block unpacked extensions. Keep the extracted folder in place. To update, replace its files and press Reload on the extension-management page. Remove the extension there when finished.

For source development, `npm ci && npm run build` creates `extensions/chromium/` and the downloadable ZIP. The script is synchronized from the canonical `userscripts/red-loop.user.js`; Safari and Chromium receive the same continuation safety logic. The Windows popup has platform-specific activation instructions.

`npm run test:browser -- --project=windows-extension` launches actual Chromium with the unpacked extension and tests its injection, explicit start, bounded send, stop and draft preservation on intercepted local ChatGPT fixtures. This verifies packaging/injection in Chromium; a live ChatGPT account and manual Edge installation still require separate acceptance.

## Windows-Doppelklick-Test (ab 11. November 2026)

Im bereits heruntergeladenen Projektordner RED-Loop-Windows-Test.cmd doppelklicken. Der Starter prueft Node.js 22+, installiert bei Bedarf npm-Abhaengigkeiten, baut die entpackte Browser-Erweiterung und prueft JS, Manifest und SHA-256 mit der kanonischen Quelle. Danach oeffnet er den Erweiterungsordner, edge://extensions/ und chatgpt.com. Einmalig in Edge Entwicklermodus und 'Entpackte Erweiterung laden' waehlen. Im bereits vorhandenen Chat den Tab neu laden, Limit 1 setzen und Start explizit anklicken. Der Starter fuehrt kein git pull/reset durch, installiert keine Erweiterung ohne Browserfreigabe und sendet keine ChatGPT-Nachrichten. Bei Fehlern wird Edge nicht gestartet. Fuer CI kann das PowerShell-Skript mit -NoBrowser -SkipTests ausgefuehrt werden. Das prueft die Windows-Buildvorbereitung, nicht einen eingeloggten Live-Chat.
