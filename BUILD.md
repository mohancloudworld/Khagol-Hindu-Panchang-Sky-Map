# Build & reproduce — Khagol

Khagol ships as plain, hand-written HTML/CSS/JavaScript plus bundled JSON data. The **only**
compiled artifact is the Swiss Ephemeris astronomy engine — `vendor/sweph.wasm` with its ES-module
glue `vendor/sweph.mjs`, compiled from C to WebAssembly. This document gives the full, reproducible
build for that artifact and explains how the rest of the add-on is assembled.

## The add-on's own code has no build step

All of Khagol's own source — the `*.html` pages, `popup.*`, `css/`, `js/`, `src/`, and the
`data/*.json` files — is **hand-written and shipped verbatim**. It is **not** transpiled,
concatenated, minified, or otherwise machine-generated. There is no bundler, no transpile, no npm
build.

The only third-party library is **`vendor/three.module.js`** — the official [Three.js](https://github.com/mrdoob/three.js)
ES-module distribution (MIT), included unmodified.

> **Note for reviewers:** an automated linter may flag a few *large* files (e.g. `js/main.js`,
> `js/view3d.js`, `js/orrery.js`, `js/api.js`, `src/api-local.js`) as "minified". They are **not**
> minified — they are original, readable, commented source that is simply long.

## Build environment / requirements

- **Operating system:** Linux or macOS (or Windows 10/11 via WSL2). Developed and tested on Linux.
- **Required program — one of:**
  - **Podman ≥ 4** — https://podman.io/docs/installation, or
  - **Docker ≥ 20** — https://docs.docker.com/engine/install/

  The build runs entirely inside a pinned container, so nothing else needs to be installed on the host.
- **Compiler toolchain:** **Emscripten `emscripten/emsdk:3.1.74`** (pinned). You do **not** install it
  manually — the build script pulls this exact image automatically.
- **Shell:** a POSIX `bash` to run the build script.
- **Not required to build the add-on:** Node.js / npm. (Node.js 20 is only needed for the *optional*
  validation in the last section.)

## Step-by-step build

1. Install **Podman** or **Docker** (links above) and ensure it can run containers.
2. Obtain the source: extract this source archive (or `git clone` the repository) and `cd` into its
   root directory.
3. Run the build script from that root:
   ```bash
   bash build-wasm.sh
   ```
4. `build-wasm.sh` performs **every** technical step automatically:
   - pulls `emscripten/emsdk:3.1.74`;
   - compiles `vendor/swe_wasm.c` together with the Swiss Ephemeris C sources in
     `vendor/swisseph-src/` via `emcc -O3` (exact flags are in the script);
   - emits **`vendor/sweph.mjs`** (ES-module glue) and **`vendor/sweph.wasm`**.
5. There is no further step. The produced `vendor/sweph.wasm` + `vendor/sweph.mjs` are exactly the
   files shipped in the add-on; every other file in the add-on is already source.

**To confirm an exact copy:** rebuild and compare `vendor/sweph.wasm` and `vendor/sweph.mjs` against
the shipped files — the pinned Emscripten tag produces identical output.

## Provenance

- **Swiss Ephemeris source:** Astrodienst — https://github.com/aloistr/swisseph
  - Pinned commit: `76d17e1be6a4f3c12eed81adc2fba531ec08e866` (2026-06-10)
  - License: **AGPL-3.0** (`vendor/swisseph-src/LICENSE`, `agpl-3.0.txt`)
  - Vendored at `vendor/swisseph-src/`, trimmed to the buildable source only (top-level `*.c`/`*.h`
    + licenses; the ~379 MB `ephe/` data files are **not** needed for Moshier mode and were removed).
- **Wrapper:** `vendor/swe_wasm.c` — exposes only the calls the add-on uses, fixed to
  `SEFLG_MOSEPH | SEFLG_SIDEREAL | SEFLG_SPEED`, whole-sign houses for the lagna.
- **Compiler:** `emscripten/emsdk:3.1.74` (pinned), run via Podman/Docker.

## Validation (optional — requires Node.js 20)

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
| **Sunrise / sunset** | **±3 s** | derived event time; below the physical (weather) uncertainty of sunrise |

**Timezones** are handled DST-aware by IANA zone name (`src/tz.js`, via `Intl`), not a fixed offset —
verified across both standard time and daylight time (e.g. America/Chicago CST and CDT).
