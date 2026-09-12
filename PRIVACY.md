# Privacy Policy — Khagol (Hindu Panchang & Sky Map)

_Last updated: 2026-09-12_ · applies to the Android app and the browser extension.

Khagol is designed to be **completely private and offline**.

## What we collect

**Nothing.** Khagol does not collect, transmit, sell, or share any personal data. It contacts no
server and has no analytics, ads, accounts, or trackers. The Android app does not even request the
INTERNET permission — it is technically unable to send anything off your device.

## What stays on your device

The following are stored **only on your device** (the app's private storage on Android; the
extension's local storage in your browser) and are never sent anywhere:

- Your chosen **location** (city / latitude / longitude / timezone).
- Your chosen **date and time** and display preferences (12h/24h, language, ayanamsa, node, etc.).
- Any **saved dates** you create.
- The **birth details you enter** for a Kundali or a Match (date, time, place). They are used only
  to compute the chart on the device, and the Match form remembers them locally so you need not
  retype them.
- Your **reminder and wake-alarm settings** (Android), and the schedule computed from them.

You can clear all of it at any time: uninstall the app, or use Android's *Clear storage* for
Khagol; in the browser, remove the extension or clear its storage.

## Permissions and what they are for

**Android app**

- **Location** (optional, foreground only) — used only when you tap **📍 Here**, to set the
  observer position for the calculations. Read on the device, never stored remotely, never shared.
  Background location is never requested.
- **Notifications** — only if you turn on reminders: a notification on the morning of a festival,
  a saved tithi or an eclipse, scheduled and shown entirely on the device.
- **Alarms & reminders / exact alarms** — only if you turn on wake alarms for brahma muhurta or
  sunrise. These times change every day, so the alarm must fire at an exact minute; it is
  scheduled on the device, and re-armed after a reboot (*receive boot completed*).
- **Set alarm** — lets the "phone alarm" button hand a time to your clock app; nothing is read back.
- **Calendar export** — when you export an `.ics` file, the file is created on the device and
  offered to the calendar app *you pick* through the system share sheet. Khagol grants that app
  read access to that one file only, and never reads your calendar.

**Browser extension**

- **`storage`** — to remember your location, date/time and saved dates locally (above).
- **`geolocation`** — only used if you click **📍 Here**; coordinates are read in the browser to set
  the observer location and are **never transmitted**.

## Data sharing

None. No data ever leaves your device. The only thing that can leave is an `.ics` file you
explicitly export, to an app you explicitly choose.

## Children

Khagol has no accounts, no ads, no in-app purchases and no data collection, so the same policy
applies to users of every age.

## Changes

If this policy changes, the new version is published at this same address with an updated date.

## Contact

For questions about this policy, open an issue on the project's repository:
https://github.com/mohancloudworld/Khagol-Hindu-Panchang-Sky-Map
