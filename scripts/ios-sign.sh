#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${APPLE_TEAM_ID:?Set APPLE_TEAM_ID in the Codemagic red_loop_signing variable group}"
if ! command -v xcode-project >/dev/null; then echo 'ERROR: Codemagic CLI tools are required.' >&2; exit 1; fi
xcode-project use-profiles --project ios/REDLoop.xcodeproj
EXPORT_OPTIONS="$HOME/export_options.plist"
if [ ! -f "$EXPORT_OPTIONS" ]; then echo 'ERROR: Export options missing. Import matching app AND extension provisioning profiles in Codemagic.' >&2; exit 1; fi
mkdir -p build/ios/ipa
xcodebuild -project ios/REDLoop.xcodeproj -scheme REDLoop -configuration Release -destination 'generic/platform=iOS' -archivePath build/REDLoop.xcarchive DEVELOPMENT_TEAM="$APPLE_TEAM_ID" archive | tee build/archive-signed.log
xcodebuild -exportArchive -archivePath build/REDLoop.xcarchive -exportOptionsPlist "$EXPORT_OPTIONS" -exportPath build/ios/ipa | tee build/export.log
test -n "$(find build/ios/ipa -name '*.ipa' -print -quit)" || { echo 'ERROR: No IPA produced.' >&2; exit 1; }
