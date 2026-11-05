#!/usr/bin/env bash
set -euo pipefail
# Run from the root of Redurbabat/RED-Loop in GitHub Codespaces or a local checkout.
test -d .git || { echo "Run in a Git checkout"; exit 1; }
test -f userscripts/red-loop.user.js || { echo "Missing RED Loop script"; exit 1; }
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
git clone --depth 1 https://github.com/quoid/userscripts.git "$tmp/upstream"
upstream_sha="$(git -C "$tmp/upstream" rev-parse HEAD)"
# Import all upstream files, including binary artwork and the original GPL-3.0 license.
# Do not replace the existing RED Loop README or userscript.
tar -C "$tmp/upstream" --exclude=.git -cf - . | tar -xf -
mkdir -p upstream
printf 'Source: https://github.com/quoid/userscripts\nCommit: %s\nLicense: GPL-3.0\n' "$upstream_sha" > upstream/PROVENANCE.txt
git add -A
git commit -m "vendor: import complete Userscripts source ($upstream_sha)"
git push
echo "Complete upstream source pushed. Review GPL-3.0 obligations before distribution."
