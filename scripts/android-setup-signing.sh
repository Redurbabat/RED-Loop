#!/usr/bin/env bash
set -euo pipefail
# Run locally (e.g. Git Bash on Windows), never in public CI.
command -v keytool >/dev/null || { echo "Install JDK 17 and add keytool to PATH." >&2; exit 1; }
command -v gh >/dev/null || { echo "Install GitHub CLI (gh) first." >&2; exit 1; }
gh auth status
repo=Redurbabat/RED-Loop
umask 077
dir="$HOME/.red-loop-signing"
mkdir -p "$dir"
key="$dir/red-loop.p12"
# Do not replace an existing repository signing identity with a new key.
# Read secret names only, never their values. Abort if listing is unavailable.
existing="$(gh secret list --repo "$repo" --json name --jq '.[].name')"
if grep -Eq '^RED_LOOP_ANDROID_(KEYSTORE_B64|KEYSTORE_PASSWORD|CERT_SHA256)$' <<< "$existing"; then
  echo "Signing secrets already exist. Do not overwrite the repository signing identity; inspect existing secrets before manual repair." >&2
  exit 1
fi
read -rsp "Password for the permanent RED Loop Android key (at least 12 characters): " RED_LOOP_ANDROID_KEYSTORE_PASSWORD
printf '\n'
[[ "${#RED_LOOP_ANDROID_KEYSTORE_PASSWORD}" -ge 12 ]] || { echo "Password too short." >&2; exit 1; }
export RED_LOOP_ANDROID_KEYSTORE_PASSWORD
temp="$(mktemp -d)"
trap 'unset RED_LOOP_ANDROID_KEYSTORE_PASSWORD; rm -rf "$temp"' EXIT
if [[ ! -f "$key" ]]; then
  keytool -genkeypair -keystore "$key" -storetype PKCS12 -alias red-loop \
    -storepass:env RED_LOOP_ANDROID_KEYSTORE_PASSWORD -keypass:env RED_LOOP_ANDROID_KEYSTORE_PASSWORD \
    -keyalg RSA -keysize 3072 -validity 10000 -dname "CN=RED Loop Android" -noprompt
else
  echo "Existing local key will be reused (not replaced)."
fi
keytool -exportcert -keystore "$key" -storetype PKCS12 -alias red-loop \
  -storepass:env RED_LOOP_ANDROID_KEYSTORE_PASSWORD -file "$temp/cert.der"
fingerprint="$(sha256sum "$temp/cert.der" | cut -d' ' -f1)"
echo "Certificate SHA-256: $fingerprint"
echo "This configures the permanent signing identity for $repo."
read -rp "Confirm upload to GitHub Actions secrets (yes/no): " confirmation
[[ "$confirmation" == yes ]] || { echo "Cancelled. Key remains local."; exit 0; }
base64 "$key" | tr -d '\r\n' | gh secret set RED_LOOP_ANDROID_KEYSTORE_B64 --repo "$repo"
printf '%s' "$RED_LOOP_ANDROID_KEYSTORE_PASSWORD" | gh secret set RED_LOOP_ANDROID_KEYSTORE_PASSWORD --repo "$repo"
printf '%s' "$fingerprint" | gh secret set RED_LOOP_ANDROID_CERT_SHA256 --repo "$repo"
echo "Done. Keep a private backup of $key and its password. Never commit them."
 <<< "$existing"; then
  echo "Signing secrets already exist. Restore the original local key before continuing." >&2
  exit 1
fi
read -rsp "Password for the permanent RED Loop Android key (at least 12 characters): " RED_LOOP_ANDROID_KEYSTORE_PASSWORD
printf '\n'
[[ "${#RED_LOOP_ANDROID_KEYSTORE_PASSWORD}" -ge 12 ]] || { echo "Password too short." >&2; exit 1; }
export RED_LOOP_ANDROID_KEYSTORE_PASSWORD
temp="$(mktemp -d)"
trap 'unset RED_LOOP_ANDROID_KEYSTORE_PASSWORD; rm -rf "$temp"' EXIT
if [[ ! -f "$key" ]]; then
  keytool -genkeypair -keystore "$key" -storetype PKCS12 -alias red-loop \
    -storepass:env RED_LOOP_ANDROID_KEYSTORE_PASSWORD -keypass:env RED_LOOP_ANDROID_KEYSTORE_PASSWORD \
    -keyalg RSA -keysize 3072 -validity 10000 -dname "CN=RED Loop Android" -noprompt
else
  echo "Existing local key will be reused (not replaced)."
fi
keytool -exportcert -keystore "$key" -storetype PKCS12 -alias red-loop \
  -storepass:env RED_LOOP_ANDROID_KEYSTORE_PASSWORD -file "$temp/cert.der"
fingerprint="$(sha256sum "$temp/cert.der" | cut -d' ' -f1)"
echo "Certificate SHA-256: $fingerprint"
echo "This configures the permanent signing identity for $repo."
read -rp "Confirm upload to GitHub Actions secrets (yes/no): " confirmation
[[ "$confirmation" == yes ]] || { echo "Cancelled. Key remains local."; exit 0; }
base64 "$key" | tr -d '\r\n' | gh secret set RED_LOOP_ANDROID_KEYSTORE_B64 --repo "$repo"
printf '%s' "$RED_LOOP_ANDROID_KEYSTORE_PASSWORD" | gh secret set RED_LOOP_ANDROID_KEYSTORE_PASSWORD --repo "$repo"
printf '%s' "$fingerprint" | gh secret set RED_LOOP_ANDROID_CERT_SHA256 --repo "$repo"
echo "Done. Keep a private backup of $key and its password. Never commit them."
