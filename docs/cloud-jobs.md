# Private cloud jobs

RED Loop 0.4.0 adds a separate cloud workspace. An iPhone or browser submits an assignment; Cloudflare stores the job, executes bounded AI steps using Durable Object alarms, and keeps the resulting text artifacts. Closing the app, locking the phone or turning off the laptop does not cancel a cloud job. Cloud execution still depends on provider availability, account quotas and the selected limits.

This workspace does not control an existing ChatGPT conversation. Its tools produce files and read supported public documentation. It cannot execute arbitrary programs, modify the user's computer or push code to a repository. Requests requiring unavailable access must stop with a request for input. A completion status records the model's conclusion, not an independent verification of arbitrary external work.

## Connect

Open the deployed dashboard's **Cloud-Aufträge** view, or the native app's Cloud view. Enter the HTTPS server address and the private access token. The web console keeps its token only in memory; reloading or disconnecting clears it. The iPhone app stores its server and token in the device Keychain. Disconnecting does not stop a job; use Pause or Stop for that.

Do not paste credentials into an assignment. Anyone with the private token can read and control this single-owner workspace. The token is never included in downloadable public application packages. Initial provisioning and rotation use Wrangler secrets, outside Git.

## Configure Cloudflare

The existing Worker uses an `AI` Workers AI binding and a SQLite Durable Object named `RedLoopJobs` through `JOBS`. Its first SQLite migration is declared in `wrangler.toml`. Workers AI is the default provider; no OpenAI key is needed for that mode. Model usage is subject to the Cloudflare account's quotas and pricing.

```sh
npm ci
npm run build
npm run check
npm test
npx wrangler secret put RED_LOOP_TOKEN
npm run dry-run
npm run deploy
```

Enter a cryptographically random token of at least 32 characters at the secure Wrangler prompt. For local development put it in ignored `.dev.vars`, never a committed file. Provider secrets and request bodies must not be logged.

Optional OpenAI mode requires `AI_PROVIDER=openai` in the Worker configuration and an `OPENAI_API_KEY` Wrangler secret. It uses the Responses API; `OPENAI_MODEL` can override the default model. Do not select this mode without configuring its key. Provider changes do not grant new workspace tools.

## API

All `/api/v1/` endpoints require `Authorization: Bearer <private token>`. Missing server configuration fails closed. JSON responses and artifacts carry `Cache-Control: no-store`; errors contain a short message without raw provider responses.

| Method and path | Behavior |
| --- | --- |
| `GET /api/v1/status` | Provider configuration and supported capabilities |
| `GET /api/v1/jobs` | Stored jobs |
| `POST /api/v1/jobs` | Start a bounded assignment; requires an `Idempotency-Key` |
| `GET /api/v1/jobs/:id` | Job, step history and artifacts |
| `POST /api/v1/jobs/:id/pause` | Pause future steps |
| `POST /api/v1/jobs/:id/resume` | Resume within the original limits |
| `POST /api/v1/jobs/:id/stop` | Stop future steps |
| `GET /api/v1/jobs/:id/artifacts/:name` | Download an artifact as plain text |

Create accepts `title` (up to 120 characters), `prompt` (up to 20,000), `maxSteps` (1–50) and `maxDurationMinutes` (1–480). Reusing the same idempotency key and payload returns the original job; changing the payload with that key returns 409. The workspace holds at most 20 jobs, with explicit storage/output bounds; it never silently deletes old jobs to make room.

States are `queued`, `running`, `paused`, `completed`, `needs_input`, `stopped`, `failed` and `limit_reached`. Pause/Stop invalidate a running step's claim, so a late model response cannot restart the job. A request already sent to the model may still consume usage. Ambiguous interruption is handled conservatively rather than silently repeating a potentially charged request. Resume may briefly return 409 while an interrupted request settles.

## Progress and verification safeguards

- Two consecutive **byte-identical output texts** from pure `continue` steps (without files or documentation reads) cause `needs_input` instead of silently spending more model requests. This is a conservative no-progress guard, not semantic quality evaluation. A user may explicitly resume after reviewing the history.
- The private job-detail API reports `usage` with `totalTokens`, `inputTokens`, `outputTokens` and `reportedSteps`. Counts are **partial and provider-reported**, never a monetary cost estimate or a hard spending limit. A missing counter is `null`, not zero; the web UI shows coverage.
- A job with status `completed` exposes `verification: "model_reported"`. It means the AI produced a result and declared completion, **not** that code was built, deployed, tested or independently reviewed.
- In the Web Cloud detail view, **Bericht (JSON) exportieren** generates a local, click-initiated report including job, step history, files and token metadata, without sending any extra request or including the private access token. This report contains **private assignment and artifact contents** and must be stored securely.
- The guard does not change earlier jobs' saved history, nor the native app's API compatibility. The original step and time limits remain in place.

## iPhone distribution

`ios-preview` on Codemagic builds the native app, executes XCTest and creates an unsigned device archive and `REDLoop-unsigned.ipa`. That IPA requires separate signing before installation. It is not a TestFlight build.

The manual `ios-signed` workflow exports an App Store IPA after Apple signing is configured for both `com.bbtred.redloop` and `com.bbtred.redloop.Extension`. Install through TestFlight after an authorized App Store Connect upload. An unsigned download or a successful simulator build alone does not make an app installable. See [signing instructions](deployment.md).

Once installed and connected, cloud jobs run without a laptop. Safari extension jobs remain a separate feature subject to Safari's foreground/background restrictions.

## References

- [Workers AI bindings](https://developers.cloudflare.com/workers-ai/get-started/workers-wrangler/)
- [Durable Object alarms](https://developers.cloudflare.com/durable-objects/api/alarms/)
- [SQLite Durable Objects](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/)
- [Codemagic signing](https://docs.codemagic.io/yaml-code-signing/signing-ios/)
- [Apple TestFlight](https://developer.apple.com/testflight/)
