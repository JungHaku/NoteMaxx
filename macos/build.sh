#!/bin/bash
# Builds the native macOS shell into ~/Desktop/NoteMaxx.app.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
APP="$HOME/Desktop/NoteMaxx.app"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

swiftc -O -swift-version 5 "$DIR/main.swift" -o "$APP/Contents/MacOS/NoteMaxx"
cp "$DIR/Info.plist" "$APP/Contents/Info.plist"
cp "$DIR/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
codesign --force --deep -s - "$APP"

echo "Built $APP"
