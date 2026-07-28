#!/bin/bash
# Builds NoteMaxx.app (self-contained: web build embedded in the bundle) into
# ~/Desktop, and a NoteMaxx.zip in release/ that can be handed to someone else.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
APP="$HOME/Desktop/NoteMaxx.app"
RELEASE="$ROOT/release"

cd "$ROOT"
npm run build

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

# Universal binary — a recipient's Mac may be Intel, and a single-arch build
# simply won't launch there.
BUILD="$(mktemp -d)"
trap 'rm -rf "$BUILD"' EXIT
for arch in arm64 x86_64; do
  swiftc -O -swift-version 5 -target "$arch-apple-macos12.0" \
    "$DIR/main.swift" -o "$BUILD/NoteMaxx-$arch"
done
lipo -create "$BUILD/NoteMaxx-arm64" "$BUILD/NoteMaxx-x86_64" \
  -output "$APP/Contents/MacOS/NoteMaxx"
cp "$DIR/Info.plist" "$APP/Contents/Info.plist"
cp "$DIR/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
cp -R "$ROOT/dist" "$APP/Contents/Resources/app"

# Ad-hoc signature. Enough for the app to run locally, but not notarized — see
# the README for what a recipient has to do on first launch.
codesign --force --deep -s - "$APP"

rm -rf "$RELEASE"
mkdir -p "$RELEASE"
# ditto (not zip) preserves the bundle's symlinks and resource forks.
ditto -c -k --sequesterRsrc --keepParent "$APP" "$RELEASE/NoteMaxx.zip"

echo "Built $APP"
echo "Shareable: $RELEASE/NoteMaxx.zip ($(du -h "$RELEASE/NoteMaxx.zip" | cut -f1))"
