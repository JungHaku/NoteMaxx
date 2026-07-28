#!/bin/bash
# Builds the web app and stages it (plus the static server) where NoteMaxx.app
# serves it from: ~/Library/Application Support/NoteMaxx.
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
APPSUP="$HOME/Library/Application Support/NoteMaxx"

cd "$DIR"
npm run build
mkdir -p "$APPSUP"
rm -rf "$APPSUP/app"
cp -R dist "$APPSUP/app"
cp scripts/server.js "$APPSUP/server.js"

echo "Deployed build to $APPSUP"
