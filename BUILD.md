# Reproducible build — Swiss Ephemeris WASM

The extension computes positions with **Swiss Ephemeris in Moshier mode**, compiled to
WebAssembly. This document lets a store reviewer (Mozilla AMO requires source + build
steps for compiled code) or anyone reproduce `vendor/sweph.wasm` byte-for-byte.

## Provenance
- **Source:** Astrodienst Swiss Ephemeris — https://github.com/aloistr/swisseph
  - Pinned commit: `76d17e1be6a4f3c12eed81adc2fba531ec08e866` (2026-06-10)
  - License: **AGPL-3.0** (`vendor/swisseph-src/LICENSE`, `agpl-3.0.txt`)
  - Vendored at `vendor/swisseph-src/`, trimmed to the buildable source only
    (top-level `*.c`/`*.h` + licenses; the ~379 MB `ephe/` data files are **not**
    needed for Moshier mode and were removed).
- **Wrapper:** `vendor/swe_wasm.c` — exposes only the calls the extension uses, forced
  to `SEFLG_MOSEPH | SEFLG_SIDEREAL | SEFLG_SPEED` (mirrors `app/panchang/core.py`).
- **Toolchain:** `emscripten/emsdk:3.1.74` (pinned), run via podman.

## Build
```bash
bash extension/build-wasm.sh        # -> extension/vendor/sweph.js + sweph.wasm
```

## Validation
`test/smoke.cjs` checks the WASM against the app's own engine output (pyswisseph
Moshier) at JD 2461206.75 (2026-06-15 06:00 UT, Lahiri):

| quantity | app reference | WASM | Δ |
|---|---|---|---|
| Sun (sidereal) | 59.944911° | 59.944911° | 0.002″ |
| Moon (sidereal) | 61.796801° | 61.796801° | 0.001″ |
| ayanamsa | 24.226625° | 24.226625° | 0.001″ |

```bash
podman run --rm -w /w -v "$PWD/extension":/w:z node:20-alpine \
  sh -c "node test/smoke.mjs && node test/validate_panchang.mjs"
```
`smoke.mjs` checks the raw engine; `validate_panchang.mjs` checks the five-anga JS port
(`src/panchang.js`) against the app's `elements.py` — anga numbers, names, and end-times
match to < 0.01 s.

## Accuracy vs the main app (and the one intentional difference)

Every test in `test/` validates a JS port against the running v1.0 app:

| Quantity | Agreement with the app | Notes |
|---|---|---|
| Sidereal Sun/Moon, ayanamsa | **< 0.002″** | same Moshier engine the app's Panchang uses |
| Five angas + end-times | **exact, < 0.01 s** | — |
| Masa, samvatsara, Ugadi, festivals (15) | **exact dates** | incl. 2026 kshaya Ugadi, all kaal types |
| Kundali chart (lagna, grahas, navamsa) | **exact, 0.0″** | — |
| Vimshottari dasha timeline | **exact** | — |
| Sky positions (9 bodies, topocentric) | RA/Dec **~1″** | Moshier vs the app's DE440s — invisible on screen |
| Orrery positions (11 bodies) | XYZ **< 6e-4 AU** | heliocentric (Sun at origin) vs the app's barycentric |
| Eclipses — contacts, magnitude, local circumstances | **exact, < 0.001 s** | same Swiss Ephemeris routines both sides; verified on 2024-04-08 (solar) and 2026-08-28 (lunar) |
| **Sunrise / sunset** | **±3 s** | see below |

**Why sunrise/sunset differs by ~3 s (and why that's fine).** Positions are an
arcsecond-level match. Sunrise/sunset, however, is a derived *event time* computed by a
*different algorithm*: the app uses Skyfield's `find_risings` (a fixed −0.8333° depression),
while the extension uses Swiss Ephemeris `swe_rise_trans` (which computes refraction for the
given pressure/temperature). Both target the same standard horizon; the ~3 s gap comes from
the differing refraction/horizon models and root-finders — **not** from the ephemeris (the
Sun's Moshier-vs-DE440s position differs <0.1″, ≈0.007 s).

This is below the **physical** uncertainty of sunrise: real horizon refraction varies with
weather (temperature, pressure, anomalous refraction) by tens of seconds to over a minute, so
any computed sunrise is only "exact" relative to a standard-atmosphere model. For Panchang it
never changes a result — it would only matter if an anga boundary fell within ~3 s of sunrise
(astronomically rare, and the app's own value is model-uncertain at that scale).

If exact convention-matching is ever wanted, `w_rise` (in `vendor/swe_wasm.c`) can be switched
to a fixed geometric −0.8333° horizon with refraction disabled, which pulls it under ~1 s.
That is cosmetic, not an accuracy gain.

### Edge / trigger-boundary coverage
Beyond the single-date ports, two tests stress the cases where the *triggering event* is
decisive (the app, drik+Lahiri, is the authority — external panchang sites use varying
method/ayanamsa/tz and aren't safe ground truth):
- `validate_festivals_multiyear.mjs` — all 15 festivals × **2020–2030 = 164 dates**, every
  trigger type (udaya/sunrise, nishita/midnight, pradosha/sunset, aparahna, madhyahna,
  chandrodaya/moonrise), incl. the **7 disputed smarta/vaishnava Janmashtami** years and all
  naturally-occurring kshaya/vriddhi. All match the app.
- `validate_edge_sunrise.mjs` — the tightest "tithi flips at sunrise" days (2026's closest is
  **+3.7 min**); tithi+nakshatra at the extension's own sunrise match the app, confirming the
  ±3 s sunrise difference (≈70× smaller than the tightest real margin) never flips a result.

Note: a birth chart's lagna is a *continuous* function of birth time (validated to 0.0″), so it
has no discrete trigger to straddle — its "edge" is just time precision, already exact.

### Timezone / DST coverage
Timezones are handled DST-aware by IANA zone name (`src/tz.js`, via `Intl`), not a fixed offset.
`validate_chicago.mjs` checks **America/Chicago** vs the app's `ZoneInfo`: all 15 festival dates
match, and sunrise/sunset match in **both CST (winter, ±1 s) and CDT (summer, ±5 s)**. (An earlier
fixed-offset model was off by 1 h in summer — that bug is fixed.)
