#!/usr/bin/env bash
# Containerized Android build (no SDK/JDK on the host). Produces:
#   app/build/outputs/apk/debug/app-debug.apk        (install for testing)
#   app/build/outputs/bundle/release/app-release.aab (Play upload; signed if keystore exists)
#
# Usage:  bash build.sh [gradle tasks...]     default: assembleDebug bundleRelease
#         bash build.sh --keygen              create the upload keystore (one time)
#
# Requirements: podman (or docker: PODMAN=docker bash build.sh). The pinned SDK image + a named
# gradle-cache volume make rebuilds fast and byte-stable.
set -euo pipefail
cd "$(dirname "$0")"

PODMAN="${PODMAN:-podman}"
IMG="docker.io/thyrlian/android-sdk:9.3"
CACHE_VOL="khagol-gradle-cache"
# Gradle's auto-generated debug.keystore lives in ~/.android; without a persistent home every
# build signed the debug APK with a fresh key, so a reinstall over a running device failed with
# INSTALL_FAILED_UPDATE_INCOMPATIBLE (uninstall first). One named volume keeps the key stable.
HOME_VOL="khagol-android-home"

run_in_sdk() {
  $PODMAN run --rm \
    -v "$PWD/..":/repo:z \
    -v "$CACHE_VOL":/root/.gradle \
    -v "$HOME_VOL":/root/.android \
    -w /repo/android \
    "$IMG" bash -lc "$*"
}

if [[ "${1:-}" == "--keygen" ]]; then
  mkdir -p keystore
  [[ -f keystore/upload-keystore.jks ]] && { echo "keystore already exists — refusing to overwrite"; exit 1; }
  PASS=$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)
  run_in_sdk "keytool -genkeypair -v -keystore keystore/upload-keystore.jks \
    -alias khagol-upload -keyalg RSA -keysize 4096 -validity 10000 \
    -storepass '$PASS' -keypass '$PASS' \
    -dname 'CN=Khagol, OU=mohancloudworld, O=mohancloudworld, C=IN'"
  cat > keystore/keystore.properties <<EOF
storeFile=keystore/upload-keystore.jks
storePassword=$PASS
keyAlias=khagol-upload
keyPassword=$PASS
EOF
  chmod 600 keystore/keystore.properties
  echo "keystore created: android/keystore/  (gitignored) — BACK IT UP somewhere safe;"
  echo "losing it means losing the ability to update the app (unless Play App Signing resets it)."
  exit 0
fi

bash sync-assets.sh

# Bootstrap a pinned Gradle wrapper once (the image's gradle is only used to generate it, in an
# empty dir so the Android plugin doesn't get evaluated); ./gradlew then runs Gradle 8.11.1 from
# the cache volume — deterministic regardless of the image's own gradle.
if [[ ! -f gradlew ]]; then
  run_in_sdk "mkdir -p /tmp/w && cd /tmp/w && touch settings.gradle \
    && gradle --no-daemon wrapper --gradle-version 8.11.1 \
    && cp -r /tmp/w/gradlew /tmp/w/gradle /repo/android/"
fi
run_in_sdk "./gradlew --no-daemon ${*:-assembleDebug bundleRelease}"

echo
echo "artifacts:"
ls -lh app/build/outputs/apk/debug/*.apk app/build/outputs/bundle/release/*.aab 2>/dev/null | awk '{print "  " $5 "  " $9}'
