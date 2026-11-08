# RED Loop architecture

## Separate execution contexts

1. **Cloud workspace:** a private API routes authenticated requests to a single-owner SQLite Durable Object. Alarms claim one bounded AI step, persist state before network work, save separate job/step/artifact records and schedule further work. Claims and recovery rules prevent late results from overriding Stop/Pause. See [cloud jobs](cloud-jobs.md).
2. **Web dashboard:** buildless HTML/CSS/ES modules delivered through Workers Assets. The Cloud view uses the private API with an in-memory token. `web/loop.js` remains a finite local demo whose messages/events exist only in tab memory. No cross-tab command channel exists.
3. **ChatGPT page:** `userscripts/red-loop.user.js` provides the real, explicitly started continuation panel. The Safari Web Extension packages that same source byte for byte. It only matches `chatgpt.com` and the legacy `chat.openai.com`, never frames. It uses the visible composer and normal send button. The worker cannot start it.
4. **Native iOS client:** SwiftUI Cloud client with HTTPS API and Keychain connection, plus a separate local demo and Safari activation help. The Cloud client polls while active; server work survives client closure. It does not claim to know Safari's website permission state or control a Safari tab. Safari website access is granted by the user through the official extension interface.
5. **In-app ChatGPT view:** the app's Chat tab loads `chatgpt.com` in a `WKWebView` and installs the canonical continuation script as a `WKUserScript` before the first load. The sign-in lives in the app's own website data store, separate from Safari. The script is fetched from the configured private Worker (cache and bundled copy as fallbacks), so a ChatGPT layout fix ships by deploy instead of by App Store build. It runs only in the main frame and only on the ChatGPT hosts. See [in-app chat](iphone-chat.md).
6. **Android app:** `android/` is a Kotlin app whose foreground service owns up to eight `WebView` conversations, so they keep working while the activity is gone and the screen is off. A partial wake lock is held while any run is active, views with no window are measured and laid out by hand so the page keeps a usable composer, and the panel reports back over a JSON `@JavascriptInterface` bridge that is accepted only from a ChatGPT origin. See [Android](android.md).

## Safety boundaries

- Maximum 50 continuations per explicitly started session, minimum 1. An explicit **endless** option replaces that number: the run then ends only on Pause, a requested completion or user-input marker, a detected error or the other stop conditions below, bounded by a 100000 counter ceiling. It is opt-in in the browser and preselected in the app's Chat tab, and it consumes service quota for as long as it runs.
- Pause keeps the counter, so Start resumes the same run instead of restarting it. Reset clears the counter.
- Start is ignored during an active run. Cancellation invalidates pending demo callbacks.
- The userscript waits for a stable assistant response, checks generation and draft states, then inserts the user-configured follow-up text into an empty editor. The text is locked during a run; only explicit Start activates it.
- After sending, the previous response cannot trigger a second send. A new response must appear; a 90-second timeout stops an unacknowledged send.
- Navigation, existing drafts and detected response errors stop real execution. Hidden tabs/focus loss also stop the default foreground mode. An explicit per-chat background option allows polling and sending without focus while the browser page remains executable. Reload never auto-resumes a stored run.
- Session storage contains counters, limits, follow-up text and the background preference per chat. Assistant text used for local change detection is kept in memory. Neither is logged or transmitted to the Worker.
- The work preset requests a completion or user-input marker as the final nonempty answer line. After generation ends and the answer stabilizes, that requested marker stops the loop. Tokens inside unfinished answers and markers not requested by the prompt do not stop custom-message runs. This uses the assistant's report, not an independent task evaluator.
- Error indicators are restricted to the active visible conversation. Text fallbacks match complete concrete service failures; ordinary retry advice or quoted error explanations do not stop work.
- The ChatGPT integration has no `postMessage` command listener, broad host permissions, native credential bridge or background scheduler. Its rules are separate from server jobs.
- The script refuses every origin other than `chatgpt.com` and `chat.openai.com`, which also bounds the injected copy in the app, where no extension manifest restricts the page.
- The native host sets only `window.__RED_LOOP_HOST__ = {app, bottomInset}` before injection: display defaults, no credentials, and no way to start a run. The page reports back only `{type:'state', running, count, limit, endless, status}`; no conversation or follow-up text crosses the bridge, and the app accepts the message only from a ChatGPT origin.
- The app fetches the script over HTTPS from the host of the stored connection only, without its token, and validates content markers, the complete file ending and a 256 KiB ceiling before use; a rejected download never replaces the cached copy. This is a content check, not a trust check: whoever can publish to that Worker decides code that runs in the signed-in ChatGPT page, and the fetch can be switched off in favor of the bundled copy.
- Suspension recovery: when the page becomes visible again, the waiting windows restart instead of reporting a stall, because iOS freezes timers while the app is not in the foreground. Explicit stop conditions are unaffected.
- The in-app view keeps only ChatGPT, its sign-in services and the offered identity providers; any other main-frame navigation is handed to the system browser. Pause is reachable from the app chrome; Start stays in the panel.
- The Android service keeps its own wake lock only while a run is active, releases it as soon as the last one stops, and requires the ongoing notification Android asks for in return. Its bridge accepts at most 4 KiB of JSON, and bounds the counters and status it reads out of it.
- A run that ends on its own posts one local notification with the reason and counter. Stops the user caused — a pause, a reset, a conversation change — stay silent, authorization is requested at the first Start rather than at launch, nothing is scheduled in advance, and the notification can be switched off.
- The extension handler returns version metadata only; no native messaging permission is requested.
- Static asset responses carry a restrictive Content Security Policy, no-referrer policy, MIME protection and denied device capabilities. Mutating methods are accepted only on authenticated API routes; `/health` exposes no secrets.

## Build structure

`npm run build` copies `web/` to ignored `dist/`, makes the downloadable userscript, and synchronizes the Safari extension resource, the app's bundled `red-loop-webview.js` and the published `dist/red-loop-webview.js`. `npm run check` asserts that all three copies are byte-identical to `userscripts/red-loop.user.js` and that its host hook and origin guard are still present. Wrangler serves the assets and health route. Dependencies and lockfile are committed; there are no runtime npm dependencies.

`ios/REDLoop.xcodeproj` contains the REDLoop app, embedded REDLoopExtension appex, and REDLoopTests target. Its shared REDLoop scheme includes XCTest. The committed project is reproducibly generated by `python scripts/generate-ios-project.py`; generation is not required to open or build it.

`scripts/ios-ci.sh` selects an available iPhone simulator, builds/tests, then creates an **unsigned** generic iOS archive and unsigned IPA. `scripts/ios-sign.sh` uses Codemagic's securely imported profiles for a separate signed archive and IPA export. An unsigned IPA needs signing before installation. A successful simulator test does not verify website permissions or physical device behavior.

## Existing vendor snapshot

The repository already contains a `vendor/userscripts/` upstream snapshot, including a nested duplicate. It is retained untouched. RED Loop's new app does not link, embed or compile this vendor tree. The README previously said nothing was vendored; that statement was inaccurate. The independent Userscripts app remains an optional host for importing the RED Loop script, under its own license.

## Official references

- [Cloudflare Worker best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
- [Safari Web Extensions](https://developer.apple.com/documentation/safariservices/safari-web-extensions)
- [WKWebView and WKUserScript](https://developer.apple.com/documentation/webkit/wkwebview)
- [Codemagic native iOS workflows](https://docs.codemagic.io/yaml-quick-start/building-a-native-ios-app/)
- [Codemagic signing, including extension profiles](https://docs.codemagic.io/yaml-code-signing/signing-ios/)
