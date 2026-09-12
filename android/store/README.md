# Play Store assets

Everything Google Play asks for at listing time, ready to upload. Specs verified with PIL
(size + mode) — all RGB, no alpha.

| File | Spec | Use |
|---|---|---|
| `icon-512-fullbleed.png` | 512×512 RGB | Store icon. Full-bleed: the launcher icon's transparent corners are filled with its own background, because Play applies its own rounding. |
| `feature-graphic-1024x500.png` | 1024×500 RGB | Feature graphic (copy of `../feature-graphic.png`, source `../feature-graphic.svg`). |
| `screenshots/phone/01…08-*.png` | 1080×1920 RGB | Phone screenshots, upload in filename order. Accepted for the 7″/10″ tablet slots too. |

## Recapturing the screenshots

They are taken from the real APK running in Waydroid (Android 13), with the display set to
a phone shape, so what the store shows is what the app draws:

```bash
adb shell wm size 1080x1920 && adb shell wm density 420      # phone shape
adb install -r app/build/outputs/apk/debug/app-debug.apk
# ... drive the app, then per screen:
adb exec-out screencap -p > shot.png                         # RGBA 1080×1920
adb shell wm size reset && adb shell wm density reset        # put the display back
```

Convert to RGB before upload (`Image.open(p).convert("RGB").save(p)`) — Play rejects alpha.
The Waydroid host here has no adb; the `khagol-adb` container (fedora-minimal + android-tools,
`--network host`, `adb connect <waydroid ip>:5555`) stands in for it.

Scenes: place Ujjain; 3D sky and dome on 2026-10-25 20:30 (Moon near Revati with Shani);
Panchang day on 2026-11-08 (Deepavali) and the November month grid; Kundali for the shared
instant; Match with two fictional births (Ujjain 1990-05-15 06:30 / Chennai 1992-08-20 21:15).
No real person's birth data is used.
