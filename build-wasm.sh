#!/usr/bin/env bash
# Reproducible build of the Swiss Ephemeris (Moshier) WASM module for the extension.
#
# Provenance for store review (Mozilla AMO requires source + build steps for compiled code):
#   - Source:     extension/vendor/swisseph-src  (Astrodienst aloistr/swisseph, AGPL-3.0)
#   - Toolchain:  emscripten/emsdk:${EMSDK_TAG}  (pinned below)
#   - Output:     extension/vendor/sweph.js + sweph.wasm
# Run from the repo root:  bash extension/build-wasm.sh
set -euo pipefail

EMSDK_TAG="3.1.74"                       # pinned for byte-reproducible builds
SRC="vendor/swisseph-src"
OUT="vendor/sweph.mjs"           # ES module: imported the same way in the extension and Node

# Standard Swiss Ephemeris compilation unit (Moshier needs no data files).
SWE_SRCS="swedate.c swehouse.c swejpl.c swemmoon.c swemplan.c sweph.c swephlib.c swecl.c swehel.c"

# Only the wrapper's functions are exported (+ malloc/free for any buffer use).
EXPORTS='["_w_set_sid_mode","_w_julday","_w_lon","_w_speed","_w_ayanamsa","_w_lagna","_w_rise","_w_equ","_w_ecl_lon","_w_pheno","_w_sidtime","_w_set_topo","_w_helio","_malloc","_free"]'

cd "$(dirname "$0")"                       # -> extension/

podman run --rm -v "$PWD":/src:z -w /src "docker.io/emscripten/emsdk:${EMSDK_TAG}" \
  emcc -O3 \
    -I "$SRC" \
    vendor/swe_wasm.c $(printf "$SRC/%s " $SWE_SRCS) \
    -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createSweph -sENVIRONMENT=web,worker,node \
    -sEXPORTED_FUNCTIONS="$EXPORTS" \
    -sEXPORTED_RUNTIME_METHODS='["ccall","cwrap"]' \
    -sALLOW_MEMORY_GROWTH=1 \
    -o "$OUT"

echo "built: extension/${OUT} + .wasm"
ls -la sweph.js sweph.wasm 2>/dev/null || ls -la vendor/sweph.*
