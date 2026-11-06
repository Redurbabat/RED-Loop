# RED Loop: Cloudflare Workers and Codemagic

## Current status

RED Loop is a Safari userscript, not a native iOS app. The Cloudflare Worker in this branch is a **static informational preview**. It does not host a live ChatGPT automation backend or install an iPhone app. Codemagic is **prepared only**; the native iOS app, Safari Web Extension, Xcode scheme, signing, and distribution are not yet implemented.

## Cloudflare Workers (workers.dev)

Prerequisites: a Cloudflare account, Node.js, and Wrangler access. Do not commit credentials.

1. Clone this repository and check out the deployment branch.
2. Run `npx wrangler login` (interactive) or configure a Cloudflare API token through your CI secret store.
3. Run `npx wrangler deploy`.
4. Wrangler prints the assigned `https://<worker>.<account>.workers.dev` URL. No URL is known until Cloudflare deploys it.
5. Verify `/` shows the preview page and `/health` returns `{"status":"ok",...}`.

The Worker stores no user data and does not need secrets. To customize the subdomain or attach a custom domain, configure it in Cloudflare.

## Codemagic (iPhone)

1. Connect the GitHub repository in Codemagic and select `codemagic.yaml`.
2. The `ios-preview` workflow is intentionally limited to `feature/ios-*` push events, avoiding failed builds on unrelated changes.
3. Before enabling iOS delivery, add a real native iOS Xcode project and Safari Web Extension, with a known shared scheme.
4. Configure Apple Developer signing and provisioning in Codemagic secure settings; never commit certificates, private keys, API keys or provisioning credentials.
5. Update the workflow to use the project's actual scheme, archive the iOS app, export a signed IPA, and optionally publish to TestFlight. Confirm iPhone hardware behavior separately.

The current workflow **fails clearly** if the repository has no Xcode project. It does not build an IPA and does not prove the userscript works on iPhone.

## Security and release

- Do not merge into `main` without explicit approval.
- Do not expose a private GitHub token through Workers or client-side code.
- Do not proxy or store ChatGPT conversations on Cloudflare.
- Verify functionality on real Safari/iPhone before calling the release ready.
