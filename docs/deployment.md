# Deployment and iPhone installation

## Cloudflare

The user-supplied existing Worker is `red-loop`, at `https://red-loop.redurbabat7.workers.dev/`. This address was checked and initially served the previous informational page. The current deployment status is recorded in `docs/test-report.md`; reachability alone is not evidence that this branch was deployed.

```sh
npm ci
npm run build
npm run check
npm test
npm run dry-run
npx wrangler whoami
npm run deploy
```

If auth expired, run `npx wrangler login` in a local terminal. For a slow browser flow use `npx wrangler login --device --browser=false --scopes account:read user:read workers:write workers_scripts:write workers_routes:write`. The CLI automatically adds its required offline scope. Keep credentials in Wrangler's local secure configuration or CI secrets, never the repository.

`wrangler.toml` declares the Worker entry, Assets binding to `dist/`, `workers_dev`, all-request security headers and observability. Work is prepared and tested on `codex/red-loop-testable-preview`. The user explicitly requested publishing the completed cloud-app changes to `main` on 2026-11-07. Wrangler prints the real URL and version ID. Verify `/health` returns version `0.4.0`, mode `cloud-jobs-and-local-demo`, `storesJobs: true` and `storesConversations: false`. Health describes capabilities; authenticated `/api/v1/status` verifies the configured provider. The old endpoint's `kind: static-preview` means old code is still deployed.

The local demo remains credential-free. Version 0.4.0 additionally includes a private cloud API, Workers AI binding and SQLite Durable Object. Before deploying that version configure the `RED_LOOP_TOKEN` secret; clients use it to access stored jobs. See [cloud configuration and API](cloud-jobs.md). Local development: `npm run dev`, then `http://127.0.0.1:8787`.

## Windows extension

The built ZIP is served at **https://red-loop.redurbabat7.workers.dev/red-loop-browser-extension.zip** and linked in the Integration view. Extract it into a permanent directory, enable Developer mode in `edge://extensions` or `chrome://extensions`, and load that directory unpacked. No userscript manager or Safari host is needed. The generated local directory is `extensions/chromium/`; source and update instructions are in `extensions/README.md`.

This is a tested local developer package, not a store submission. A managed browser may require administrator policy approval. The extension requests access only to ChatGPT hosts and runs no background worker.

## Codemagic simulator workflow (no Apple membership required)

1. Sign into Codemagic and add/connect `Redurbabat/RED-Loop` if not already connected.
2. Select branch `codex/red-loop-testable-preview`, configuration `codemagic.yaml`, workflow **ios-preview**.
3. Start a build. It runs `scripts/ios-ci.sh`: detect/list the committed Xcode project and shared scheme, select an available iPhone simulator, execute XCTest, then archive a generic unsigned iOS app including the extension.
4. Download `REDLoopTests.xcresult`, simulator `.app`, logs, unsigned `.xcarchive` and `REDLoop-unsigned.ipa` from the build artifacts. The IPA is packaged for separate signing; it cannot be installed directly on an iPhone without an appropriate signature/provisioning.

The project has no third-party Swift dependencies or XcodeGen installation requirement. Xcode is required; Windows cannot run these build commands. GitHub Actions contains the equivalent optional macOS validation path, but an account Actions budget block may prevent the runner from starting.

## Signed iPhone IPA

The **ios-signed** Codemagic workflow is manual and separate so missing signing does not affect the simulator path.

Required external setup:

- Active Apple Developer Program membership and authorized team.
- Register app bundle ID `com.bbtred.redloop` and extension ID `com.bbtred.redloop.Extension` in that team. If those names are unavailable, change both IDs in the project generator, regenerate the project, and update `codemagic.yaml` consistently.
- In Codemagic Team settings → Code signing identities: securely import/generate an Apple Distribution certificate **with its private key**, plus matching App Store provisioning profiles for **both** bundle IDs.
- Create the Codemagic secret variable group `red_loop_signing` with `APPLE_TEAM_ID` for the same team. Never place certificates, .p8/.p12, profile contents or token values in Git.

Run **ios-signed**. The workflow first executes the simulator/test path, then `xcode-project use-profiles`, creates a signed archive and exports the IPA using Codemagic's generated `export_options.plist`. Missing profiles/export settings produce a specific error; no empty IPA is presented as success.

An App Store IPA is intended for App Store Connect/TestFlight, not direct device sideloading. To use TestFlight, create the matching App Store Connect app, connect an App Store Connect API key through Codemagic's secure integration, and upload the exported IPA through that integration or Apple's Transporter. This repository does not automatically submit a build or send invitations. For direct registered-device installation, configure ad-hoc distribution and register the test device before generating both provisioning profiles.

## Xcode on a Mac

Open `ios/REDLoop.xcodeproj`, choose REDLoop, select an iPhone simulator and run. For a personal physical-device build, select your team in Signing & Capabilities for the app and extension and let Xcode manage provisioning, subject to Apple's account/extension restrictions.

`python3 scripts/generate-ios-project.py` regenerates the committed project only when sources/targets change. `scripts/generate-icons.ps1` regenerates the typographic R artwork on Windows. Neither is necessary to build the committed project.

After installation, open the Cloud view and connect the HTTPS server with your private token. Jobs continue on the server when the app is closed. For the separate Safari feature: Settings → Apps → Safari → Extensions → RED Loop, enable and grant website access. On iOS versions where Safari is listed at Settings root, open Safari there. The host cannot grant permissions for the user. Start Safari continuations from the on-page panel.

## Manual device acceptance

Test with a non-sensitive conversation and limit 1 first. Confirm the panel is present, start/stop controls remain accessible, an existing draft survives unchanged, navigation and tab hiding stop execution, and the count never exceeds the chosen limit. Then test iPad rotation, Mac keyboard operation and VoiceOver. Record each device/browser/OS version separately from simulator results.
