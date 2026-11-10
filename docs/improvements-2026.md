# RED Loop – 15 improvements: implementation and validation register

Scope: integration target is the existing open PR #6, not `main`. Do not mark a feature completed merely because source was committed. This is a work register, not a release certificate. Native tests, CI and production deployment remain separate evidence.

| # | Goal | State after this change | Acceptance gate |
|---|---|---|---|
| 1 | Reliable Android background operation | Implemented in PR #6, **unverified** | Screen-off 30/120 min on actual tablet with 1, 3, 5 conversations; record CPU/battery/OS kills |
| 2 | Crash-safe resumption | Cloud recovery implemented; local Ollama now saves an in-flight claim and per-step JSON checkpoints; Android restart logic unverified | Kill during a send, restart: no duplicate submission, explicit recovery reason |
| 3 | Intelligent endless mode | Existing end-of-work markers; **new cloud repeated-output guard** | Two unchanged cloud continuations require manual review; ChatGPT loops also need live scenario tests |
| 4 | Fix GitHub Actions | **Blocked by issue #9 outside application code** | Both Ubuntu and macOS jobs publish actual passing steps/logs |
| 5 | Physical iPhone tests | Pending | Sign-in, work loop, pause, notification, background/suspension and signing on device |
| 6 | Task planning | Planned | Explicit structured plan and dependencies, progress checked against deliverables |
| 7 | Multi-agent coordination | Planned | Isolated workspaces and collision-free tasks, one owner per write, auditable merges |
| 8 | GitHub integration | Planned, requires an authorized GitHub App and permissions | Read-only discovery first; separately approved scoped write actions and reliable CI |
| 9 | Independent completion verification | **Partial:** model-reported badge, evidence export; not actual verification | Code jobs require test/build evidence before verified badge |
| 10 | Multiple model providers / Ollama | Workers AI and optional OpenAI existing; **new local Ollama CLI** for bounded text tasks; app gateway still planned | User-controlled local gateway with authentication, TLS, host allowlist, capacity policy |
| 11 | Cross-platform unified job dashboard | Cloud API shared; device-local ChatGPT tabs are separate | Sync server job IDs/states on Web/iPhone/Android/Windows without centralizing credentials |
| 12 | Notifications | Existing iOS/Android native hooks in PR #6, unverified | Notification permission, stop reasons, duplicates and per-chat controls tested |
| 13 | Resource and cost limits | Existing per-job step/time and storage limits; **new partial token reporting and optional reported-token budget** | Explicit user budget and truthful provider accounting; stop before overruns where possible |
| 14 | Secure script delivery | Existing HTTPS+content checks, **no signature verification** | Signed/pinned payload digest with rollback, same source for all clients |
| 15 | RED Morph visual consistency | Existing Web Motion Studio; native parity pending | Shared component tokens, measured UI and accessibility tests across platforms |

## Safe release sequence

1. Re-run JavaScript unit tests, source checks and browser fixtures for PR #6 with real logs.
2. Diagnose GitHub Actions pre-step failure #9 in repository/account UI. Do **not** change billing/spending limits without owner approval.
3. Test real iPhone, then tablet/Android background behaviour; never claim a WebView can run on locked iOS.
4. Add GitHub read-only and task-planning capabilities behind clearly scoped authorizations.
5. Add tested verification and optional local model gateway before enabling unattended write actions.
6. Confirm Cloudflare deployment and its /health version separately from source/PR tests.

## Honest evidence boundary

This change is source and tests only. The Github connected-file interface cannot compile Xcode, operate a physical device, provision a signed IPA, fix account-level Actions billing/policy or deploy Cloudflare. New tests are supplied for execution; passing claims require corresponding test output.
