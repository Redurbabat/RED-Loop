#!/usr/bin/env python3
"""Package the device archive for a separate, user-controlled signing tool.

This creates an unsigned IPA. It cannot be installed directly on an iPhone.
"""
import pathlib
import plistlib
import sys
import zipfile

root = pathlib.Path(__file__).resolve().parent.parent
apps = sorted((root / "build/REDLoop-unsigned.xcarchive/Products/Applications").glob("*.app"))
if len(apps) != 1:
    sys.exit("ERROR: Expected exactly one archived device app.")
app = apps[0]
with (app / "Info.plist").open("rb") as source:
    info = plistlib.load(source)
if info.get("CFBundleIdentifier") != "com.bbtred.redloop":
    sys.exit("ERROR: Unexpected archived bundle identifier.")
if not list((app / "PlugIns").glob("*.appex")):
    sys.exit("ERROR: Embedded Safari extension missing.")
output = root / "build/ios/unsigned/REDLoop-unsigned.ipa"
output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(app.rglob("*")):
        if file.is_symlink():
            sys.exit("ERROR: Unexpected symlink in device bundle.")
        if file.is_file():
            archive.write(file, pathlib.PurePosixPath("Payload", app.name, *file.relative_to(app).parts))
with zipfile.ZipFile(output) as archive:
    if archive.testzip() is not None:
        sys.exit("ERROR: IPA integrity check failed.")
print("Created build/ios/unsigned/REDLoop-unsigned.ipa — signing is required before installation.")
