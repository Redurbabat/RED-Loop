# GitHub Actions: diagnosis and recovery

Status: **blocked by infrastructure / not yet diagnosed** (8 November 2026). Tracking issue: [#9](https://github.com/Redurbabat/RED-Loop/issues/9).

## Evidence

RED Loop's `RED Loop validation` workflow has repeatedly reported `failure` for **both** its GitHub-hosted `web` (Ubuntu) and `ios` (macOS) jobs. In the connected GitHub API, the returned job records contained **no step details** and **no logs URL**; downloading job logs returned `404 BlobNotFound`. A retry of the failed jobs was accepted and immediately failed in the same way.

- [Workflow run 42433729624](https://github.com/Redurbabat/RED-Loop/actions/runs/42433729624): original web/iOS failures, followed by a rerun with newly allocated failing jobs 128588917936 and 128588918100. No exposed logs or steps in either attempt.
- [Workflow run 42425356191](https://github.com/Redurbabat/RED-Loop/actions/runs/42425356191): earlier identical failure pattern.
- Historical Pull Requests 4, 5, 7 and 8 have not supplied reliable step-level CI evidence from GitHub Actions.

**Unknown:** Whether this is an account billing/usage limit, Actions settings, runner capacity, workflow-validation problem or another GitHub-side failure. No individual source/test failure can be inferred from absent logs. Do not claim the release is validated.

## Maintainer triage (requires repository/account access)

1. Open the workflow run in GitHub **Actions**. Inspect any validation banner or job allocation message at the top of the run page and the job graph. This may include information not exposed through the connector.
2. Check **Settings → Actions → General** for disabled workflows or policies blocking GitHub-hosted runners, and verify that the repository is allowed to use `actions/checkout`, `actions/setup-node`, and `actions/upload-artifact`.
3. Review the account or organization **Billing & licensing** / GitHub Actions usage and budget alerts. GitHub documents Actions failures from exhausted budgets or storage. Do not change spending limits without owner approval.
4. If jobs start but diagnostics remain insufficient, use **Re-run jobs → Enable debug logging** in the GitHub UI. Check runner allocation and `Set up job` output. A CI tool cannot fix a runner that is never assigned.
5. Once runners work, verify **both** web and iOS jobs with named step outcomes and logs. Confirm that a subsequent push-to-main run also executes.

References: [Troubleshooting workflows](https://docs.github.com/en/actions/how-tos/troubleshoot-workflows), [Using workflow logs](https://docs.github.com/en/actions/how-tos/monitor-workflows/use-workflow-run-logs).

## Local fallback, not a substitute for CI

With Node.js 22+ and package dependencies:

```sh
npm ci
npm run build
npm run check
npm test
npm run dry-run
npx playwright install --with-deps chromium webkit
npm run test:browser
```

For iOS, use macOS with Xcode and an available simulator:

```sh
bash scripts/ios-ci.sh
```

The workflow now exposes each web phase separately, emits a job summary when the runner executes, preserves test artifacts and triggers on pull requests, manual dispatch and pushes to `main`. If runners never start, no step-level summary can be generated; the maintainer must first resolve the upstream Actions issue.

Do not confuse a successful Node unit test run with a physical device check, a GitHub merge with successful CI, or a Wrangler `--dry-run` with a Cloudflare deployment. Deployment and native signing remain separate.
