#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v xcodebuild >/dev/null; then echo 'ERROR: Xcode on macOS is required; Windows cannot build iOS.' >&2; exit 1; fi
PROJECT=ios/REDLoop.xcodeproj
if [ ! -f "$PROJECT/project.pbxproj" ]; then echo "ERROR: Missing $PROJECT" >&2; exit 1; fi
mkdir -p build
xcodebuild -list -project "$PROJECT"
DEVICE_ID=$(xcrun simctl list devices available -j | python3 -c 'import json,re,sys; d=json.load(sys.stdin); ids=[x["udid"] for k,v in d["devices"].items() if (m:=re.search(r"iOS[-.]([0-9]+)",k)) and int(m.group(1))>=17 for x in v if x.get("isAvailable") and "iPhone" in x["name"]]; assert ids,"No available iOS 17+ iPhone simulator; install an iOS runtime in Xcode"; print(ids[0])')
RESULT_BUNDLE="build/REDLoopTests-$(date -u +%Y%m%dT%H%M%SZ)-$$.xcresult"
xcodebuild -project "$PROJECT" -scheme REDLoop -configuration Debug -destination "id=$DEVICE_ID" -derivedDataPath build/DerivedData -resultBundlePath "$RESULT_BUNDLE" CODE_SIGNING_ALLOWED=NO test | tee build/simulator.log
xcodebuild -project "$PROJECT" -scheme REDLoop -configuration Release -destination 'generic/platform=iOS' -archivePath build/REDLoop-unsigned.xcarchive CODE_SIGNING_ALLOWED=NO archive | tee build/archive-unsigned.log
python3 scripts/package-unsigned-ipa.py
echo 'Simulator tests, unsigned archive and unsigned IPA ready. Sign the IPA before installing on iPhone.'
