#!/usr/bin/env bash
set -euo pipefail
# Run only from a trusted build, with a private keystore provided by secrets.
# Never fall back to a randomly generated debug key.
: "${RED_LOOP_ANDROID_KEYSTORE_B64:?Missing permanent Android keystore}"
: "${RED_LOOP_ANDROID_KEYSTORE_PASSWORD:?Missing Android keystore password}"
: "${RED_LOOP_ANDROID_CERT_SHA256:?Missing expected signing certificate fingerprint}"
: "${GITHUB_RUN_NUMBER:?Missing CI release sequence}"
[[ "$GITHUB_RUN_NUMBER" =~ ^[0-9]{1,10}$ ]] || { echo "Invalid build sequence" >&2; exit 1; }
export RED_LOOP_ANDROID_VERSION_CODE="$((100000 + 10#$GITHUB_RUN_NUMBER))"
[[ "$RED_LOOP_ANDROID_VERSION_CODE" -le 2100000000 ]] || exit 1
expected="$(printf '%s' "$RED_LOOP_ANDROID_CERT_SHA256" | tr '[:upper:]' '[:lower:]' | tr -d ':[:space:]')"
[[ "$expected" =~ ^[a-f0-9]{64}$ ]] || { echo "Invalid certificate fingerprint" >&2; exit 1; }
umask 077
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
printf '%s' "$RED_LOOP_ANDROID_KEYSTORE_B64" | base64 --decode > "$work/red-loop.p12"
unset RED_LOOP_ANDROID_KEYSTORE_B64
# Validate the certificate before spending time on Gradle or signing.
keytool -exportcert -keystore "$work/red-loop.p12" -storetype PKCS12 -alias red-loop \
  -storepass:env RED_LOOP_ANDROID_KEYSTORE_PASSWORD -file "$work/cert.der"
actual_key="$(sha256sum "$work/cert.der" | cut -d' ' -f1)"
if [[ "$actual_key" != "$expected" ]]; then
  echo "Signing certificate mismatch; refusing to build." >&2
  exit 1
fi
SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
tools="$SDK/build-tools/35.0.0"
test -x "$tools/apksigner" && test -x "$tools/zipalign" && test -x "$tools/aapt"
cd "$(dirname "$0")/../android"
( unset RED_LOOP_ANDROID_KEYSTORE_PASSWORD RED_LOOP_ANDROID_CERT_SHA256; ./gradlew --no-daemon --stacktrace assembleRelease )
dir=app/build/outputs/apk/release
unsigned="$dir/app-release-unsigned.apk"
test -f "$unsigned"
"$tools/zipalign" -f 4 "$unsigned" "$work/aligned.apk"
"$tools/apksigner" sign --ks "$work/red-loop.p12" --ks-type PKCS12 --ks-key-alias red-loop \
  --ks-pass env:RED_LOOP_ANDROID_KEYSTORE_PASSWORD --key-pass env:RED_LOOP_ANDROID_KEYSTORE_PASSWORD \
  --out "$work/signed.apk" "$work/aligned.apk"
verified="$("$tools/apksigner" verify --verbose --print-certs "$work/signed.apk")"
actual="$(printf '%s\n' "$verified" | sed -n 's/^Signer #1 certificate SHA-256 digest: //p' | tr '[:upper:]' '[:lower:]' | tr -d ':[:space:]')"
if [[ "$actual" != "$expected" ]]; then
  echo "Signing certificate mismatch; no update APK will be published." >&2
  exit 1
fi
"$tools/zipalign" -c 4 "$work/signed.apk"
badging="$("$tools/aapt" dump badging "$work/signed.apk")"
package_line="$(printf '%s\n' "$badging" | sed -n '/^package: /p')"
[[ "$package_line" == *"name='com.bbtred.redloop'"* ]] || { echo "Unexpected app ID" >&2; exit 1; }
[[ "$package_line" == *"versionCode='$RED_LOOP_ANDROID_VERSION_CODE'"* ]] || { echo "Unexpected APK version code" >&2; exit 1; }
cp "$work/signed.apk" "$dir/RED-Loop-signed.apk"
printf 'Verified permanent signing certificate: %s\nVersion code: %s\n' "$actual" "$RED_LOOP_ANDROID_VERSION_CODE"
