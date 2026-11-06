#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v xcodebuild >/dev/null; then echo 'ERROR: Xcode on macOS is required; Windows cannot build iOS.' >&2; exit 1; fi
PROJECT=ios/REDLoop.xcodeproj
if [ ! -f "$PROJECT/project.pbxproj" ]; then echo "ERROR: Missing $PROJECT" >&2; exit 1; fi
mkdir -p build
xcodebuild -list -project "$PROJECT"
DEVICE_ID=$(xcrun simctl list devices available -j | python3 -c 'import json,sys; d=json.load(sys.stdin); ids=[x["udid"] for k,v in d["devices"].items() if "iOS" in k for x in v if x.get("isAvailable") and "iPhone" in x["name"]]; assert ids,"No available iPhone simulator; install an iOS runtime in Xcode"; print(ids[0])')
xcodebuild -project "$PROJECT" -scheme REDLoop -configuration Debug -destination "id=$DEVICE_ID" -derivedDataPath build/DerivedData -resultBundlePath build/REDLoopTests.xcresult CODE_SIGNING_ALLOWED=NO test | tee build/simulator.log
xcodebuild -project "$PROJECT" -scheme REDLoop -configuration Release -destination 'generic/platform=iOS' -archivePath build/REDLoop-unsigned.xcarchive CODE_SIGNING_ALLOWED=NO archive | tee build/archive-unsigned.log
echo 'Unsigned simulator app, XCTest results and device archive ready. This is NOT an installable IPA.'
