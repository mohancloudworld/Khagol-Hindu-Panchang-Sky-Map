#!/usr/bin/env bash
# Copy the extension's web app into the Android assets dir (served as the WebView site root).
# Assets are a build product (gitignored) — the source of truth stays extension/. Run from
# anywhere; safe to re-run (does a clean sync).
set -euo pipefail
cd "$(dirname "$0")"

SRC=../extension
DST=app/src/main/assets

rm -rf "$DST"
mkdir -p "$DST"

# The sky-map app + everything it loads. Excluded on purpose: popup.* + manifest.json (extension
# chrome), vendor C sources + swisseph-src (build inputs, in the repo not the APK), test/ docs/.
cp "$SRC/app.html" "$DST/"
cp -r "$SRC/css" "$SRC/js" "$SRC/src" "$SRC/data" "$SRC/textures" "$DST/"
mkdir -p "$DST/vendor" "$DST/icons"
cp "$SRC/vendor/three.module.js" "$SRC/vendor/sweph.mjs" "$SRC/vendor/sweph.wasm" "$DST/vendor/"
cp "$SRC"/icons/icon-*.png "$DST/icons/"

echo "assets synced -> $DST"
du -sh "$DST" | awk '{print "size: " $1}'
