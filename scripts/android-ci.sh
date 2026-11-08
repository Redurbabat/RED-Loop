#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/../android"
if [ ! -f gradlew ]; then echo 'ERROR: Missing Gradle wrapper in android/.' >&2; exit 1; fi
chmod +x gradlew
# JVM unit tests first: they need no device and cover the state parser, the
# stop classifier, the script source rules and the host allowlists.
./gradlew --no-daemon --stacktrace testDebugUnitTest
# A debug APK is signed with the standard debug key and installs directly.
./gradlew --no-daemon --stacktrace assembleDebug
APK=app/build/outputs/apk/debug/app-debug.apk
test -f "$APK" || { echo 'ERROR: No APK produced.' >&2; exit 1; }
echo "Android unit tests passed. $APK is ready to copy onto a tablet."
