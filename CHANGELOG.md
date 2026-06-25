# Changelog

All notable changes to Khagol are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Kundali summary report card matching the classic Vedic Astro Chart layout: birth details,
  tithi/karana/yoga, a full planet table (zodiac, house, DMS degree, nakshatra-pada-lord),
  and the complete 9×9 Vimshottari Maha/Antar Dasha matrix.
- "Export PDF" button in the Kundali tab: opens the browser print dialog pre-formatted to
  save only the summary report as PDF. Includes an optional Name field for the report header.

### Changed
- `computeKundali` now returns a `summary` object with all report-ready data, plus DMS
  degree formatting and nakshatra lords for lagna and every graha.

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
