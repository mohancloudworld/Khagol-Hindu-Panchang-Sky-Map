# Reproducible build — Swiss Ephemeris WASM

Khagol computes all positions with **Swiss Ephemeris in Moshier mode**, compiled to
WebAssembly and bundled offline. This document lets a store reviewer (Mozilla AMO requires
source + build steps for compiled code) or anyone reproduce `vendor/sweph.wasm` byte-for-byte.

## Provenance
- **Source:** Astrodienst Swiss Ephemeris — https://github.com/aloistr/swisseph
  - Pinned commit: `76d17e1be6a4f3c12eed81adc2fba531ec08e866` (2026-06-10)
  - License: **AGPL-3.0** (`vendor/swisseph-src/LICENSE`, `agpl-3.0.txt`)
  - Vendored at `vendor/swisseph-src/`, trimmed to the buildable source only
    (top-level `*.c`/`*.h` + licenses; the ~379 MB `ephe/` data files are **not**
    needed for Moshier mode and were removed).
- **Wrapper:** `vendor/swe_wasm.c` — exposes only the calls the extension uses, forced
  to `SEFLG_MOSEPH | SEFLG_SIDEREAL | SEFLG_SPEED`.
- **Toolchain:** `emscripten/emsdk:3.1.74` (pinned), run via podman/docker.

## Build
```bash
bash build-wasm.sh        # -> vendor/sweph.js + vendor/sweph.wasm
```
That's the only build step; everything else (HTML/CSS/JS, JSON data) ships as-is with no
bundler or transpile.

## Validation

The compute layer was validated against an **independent Python reference implementation**
(`pyswisseph` in Moshier mode for the engine, Skyfield for cross-checking sky positions). At
JD 2461206.75 (2026-06-15 06:00 UT, Lahiri) the WASM engine matches the reference:

| Quantity | Reference | WASM | Δ |
|---|---|---|---|
| Sun (sidereal) | 59.944911° | 59.944911° | 0.002″ |
| Moon (sidereal) | 61.796801° | 61.796801° | 0.001″ |
| Ayanamsa | 24.226625° | 24.226625° | 0.001″ |

Higher-level agreement of the JavaScript ports against the same reference:

| Quantity | Agreement | Notes |
|---|---|---|
| Sidereal Sun/Moon, ayanamsa | **< 0.002″** | same Moshier engine |
| Five angas + end-times | **exact, < 0.01 s** | tithi, nakshatra, yoga, karana, vara |
| Masa, samvatsara, Ugadi, festivals | **exact dates** | incl. 2026 kshaya Ugadi, all kaal types |
| Kundali chart (lagna, grahas, navamsa) | **exact, 0.0″** | — |
| Vimshottari dasha timeline | **exact** | — |
| Sky positions (9 bodies, topocentric) | RA/Dec **~1″** | Moshier vs DE440s — invisible on screen |
| Orrery positions (11 bodies) | XYZ **< 6e-4 AU** | heliocentric reference |
| **Sunrise / sunset** | **±3 s** | see below |

**Why sunrise/sunset differs by ~3 s (and why that's fine).** Positions are an
arcsecond-level match. Sunrise/sunset is a derived *event time* from a root-finder: Khagol uses
Swiss Ephemeris `swe_rise_trans` (which models refraction for the given pressure/temperature).
The few-second spread between any two standard implementations comes from differing
refraction/horizon models, **not** the ephemeris. It is well below the physical uncertainty of
sunrise itself — real horizon refraction varies with weather by tens of seconds to over a
minute. For Panchang it never changes a result; it would only matter if an anga boundary fell
within ~3 s of sunrise (astronomically rare).

If exact convention-matching to a fixed geometric horizon is ever wanted, `w_rise` (in
`vendor/swe_wasm.c`) can be switched to a fixed −0.8333° depression with refraction disabled,
which pulls it under ~1 s. That is cosmetic, not an accuracy gain.

**Timezones** are handled DST-aware by IANA zone name (`src/tz.js`, via `Intl`), not a fixed
offset — verified across both standard time and daylight time (e.g. America/Chicago CST and CDT).
