#!/usr/bin/env bash
set -euo pipefail
# Exercise the production signing path without accessing release secrets.
# The disposable test key and both APKs must never be published.
cd "$(dirname "$0")/.."
root="$PWD"
out="$root/android/app/build/outputs/apk/release/RED-Loop-signed.apk"
umask 077
work="$(mktemp -d)"
trap 'rm -f "$out"; rm -rf "$work"' EXIT
export RED_LOOP_ANDROID_KEYSTORE_PASSWORD="$(openssl rand -hex 24)"
keytool -genkeypair -keystore "$work/test.p12" -storetype PKCS12 -alias red-loop \
  -storepass:env RED_LOOP_ANDROID_KEYSTORE_PASSWORD -keypass:env RED_LOOP_ANDROID_KEYSTORE_PASSWORD \
  -keyalg RSA -keysize 2048 -validity 2 -dname "CN=RED Loop disposable CI test" -noprompt
keytool -exportcert -keystore "$work/test.p12" -storetype PKCS12 -alias red-loop \
  -storepass:env RED_LOOP_ANDROID_KEYSTORE_PASSWORD -file "$work/test.der"
export RED_LOOP_ANDROID_KEYSTORE_B64="$(base64 "$work/test.p12" | tr -d '\r\n')"
export RED_LOOP_ANDROID_CERT_SHA256="$(sha256sum "$work/test.der" | cut -d' ' -f1)"
# Negative test: a different certificate must be rejected before Gradle.
if RED_LOOP_ANDROID_CERT_SHA256="$(printf '%064d' 0)" GITHUB_RUN_NUMBER=1 bash scripts/android-sign-release.sh; then
  echo "ERROR: wrong certificate was accepted" >&2; exit 1
fi
GITHUB_RUN_NUMBER=1 bash scripts/android-sign-release.sh
mv "$out" "$work/first.apk"
GITHUB_RUN_NUMBER=2 bash scripts/android-sign-release.sh
mv "$out" "$work/second.apk"
SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
tools="$SDK/build-tools/35.0.0"
for spec in first:100001 second:100002; do
  file="$work/${spec%:*}.apk"
  code="${spec#*:}"
  digest="$("$tools/apksigner" verify --print-certs "$file" | sed -n 's/^Signer #1 certificate SHA-256 digest: //p')"
  [[ "$digest" == "$RED_LOOP_ANDROID_CERT_SHA256" ]]
  package="$("$tools/aapt" dump badging "$file" | sed -n '/^package: /p')"
  [[ "$package" == *"name='com.bbtred.redloop'"* && "$package" == *"versionCode='$code'"* ]]
done
echo "Both APKs have the same certificate, unchanged app ID and increasing version codes."
echo "Static APK update compatibility verified; on-device installation remains a separate test."
