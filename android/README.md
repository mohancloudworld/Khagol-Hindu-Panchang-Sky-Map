# Khagol — Android app

Native Kotlin shell around the same offline web app the browser extension ships: one
hardware-accelerated WebView serving the bundled `extension/` code (JS + Swiss Ephemeris WASM +
JSON data) from APK assets via `WebViewAssetLoader`. **No INTERNET permission** — the app cannot
make a network request at all; optional device location backs the "Here" button.

- `applicationId`: `io.github.mohancloudworld.khagol` · minSdk 26 (Android 8.0) · targetSdk 36 (Play requires 36 for new apps and updates since 31 Aug 2026)
- App code: `app/src/main/kotlin/.../MainActivity.kt` (the entire native layer)
- Web assets: **generated** into `app/src/main/assets/` by `sync-assets.sh` from `../extension/`
  (gitignored — the extension stays the single source of truth)

## Build (containerized — no SDK/JDK on the host)

```bash
bash build.sh                 # sync assets + assembleDebug + bundleRelease
bash build.sh assembleDebug   # just the debug APK
bash build.sh --keygen        # one-time: create the upload keystore (gitignored)
```

Artifacts: `app/build/outputs/apk/debug/app-debug.apk`,
`app/build/outputs/bundle/release/app-release.aab` (signed when `keystore/` exists).

Install on a device: `adb install app/build/outputs/apk/debug/app-debug.apk`
(or copy the APK over and open it).

⚠️ **Back up `android/keystore/` somewhere safe** (it is gitignored). It is the Play upload key.

## Features (all offline, no Kotlin work needed — same WebView, same assets)

The app picks up whatever `sync-assets.sh` copies from `../extension/`, so the Kundali
interpretation accordion, the Panchang "Today's guidance" card, and the new "Match" tab
(classical 36-guna Kundali Milan compatibility scoring between two birth charts) all work
offline exactly as in the browser extension — no new permissions, no network calls.

## Store submission

See `../ANDROID_STORE_GUIDE.html` — every Play Console step and field, with copy buttons.
Play assets live in `store/`: `icon-512-fullbleed.png`, `feature-graphic-1024x500.png` and
`screenshots/phone/01…08-*.png` (1080×1920, captured from the APK in Waydroid — see
`store/README.md` for how to recapture). `feature-graphic.svg` / `icon-fg.svg` are the sources.
