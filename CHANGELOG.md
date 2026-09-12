# Changelog

All notable changes to Khagol are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

## [1.1.0] — 2026-09-12

- **Android app** (`android/`): native WebView shell around the same offline code — no INTERNET
  permission; optional location, notifications and exact alarms. targetSdk 36.
- **Grahana (eclipses)**: solar and lunar eclipses computed with the Swiss Ephemeris eclipse
  routines — contact times, magnitudes, per-location obscuration and visibility. The Sun and Moon
  are drawn eclipsed in the 3D/2D sky; eclipses appear in the day card, the month calendar, the
  popup, `.ics` export and reminders (with an opt-in "only if visible here" filter).
- **Match (Kundali Milan)**: 36-guna ashtakoota matching between two charts; plain-language Kundali
  interpretation; day guidance card.
- **Reminders and wake alarms** (Android): festival / saved-tithi / eclipse notifications a chosen
  number of days ahead (default 3), and exact alarms at brahma muhurta or sunrise, re-planned when
  the location changes.
- **Calendar export**: festivals, saved dates and eclipses as `.ics`.
- **Typed dates everywhere**: year / month / day boxes (with a 📅 picker) on every date field; the
  month calendar gains month / year selectors, year arrows and Today; the day card gains prev/next
  day; range errors and 31-Feb clamps are explained inline.
- Telugu and Sanskrit names for grahana and eclipse types; geomagnetic declination (WMM2025) for
  the compass; a paused clock now holds the typed minute exactly.
- Privacy policy extended to cover the Android permissions.

## [1.0.0] — 2026-06-20

First public release.

- Daily Hindu Panchang: tithi, nakshatra, yoga, karana, vara, masa, paksha, samvatsara,
  sunrise/sunset, and day-quality windows (Rahu Kalam, Yamagandam, Gulika, hora, choghadiya,
  abhijit, brahma muhurta); correct kshaya/vriddhi handling.
- Month calendar with festivals by kaal rule (udaya/madhyahna/aparahna/pradosha/nishita/chandrodaya).
- Interactive 3D sky and 2D dome: stars, planets, Sun & Moon with phase, constellations, Milky Way,
  Messier objects, alt-az grid, ecliptic.
- Solar-system orrery with the sidereal Rashi band (geocentric zodiac, Earth→body lines, Spica axis).
- South-Indian Kundali (lagna, grahas, navamsa, Vimshottari dasha) for any date/time/place.
- Saved dates that recur yearly by tithi + masa.
- Hindu names by default (switchable to English); search by Hindu or IAU name.
- Keyboard navigation, time-lapse (up to years/second), deep-time star drift.
- Fully offline: Swiss Ephemeris (Moshier) compiled to WebAssembly; no network, no tracking.
