// Local data/API layer — same exports and return shapes as a fetch-based api.js, but computed
// locally (Swiss Eph Moshier WASM + bundled JSON) instead of fetching /api/*. The front end
// re-exports this as ./api.js. All compute is validated against an independent Python reference
// (pyswisseph Moshier + Skyfield) to sub-arcsecond agreement.
import * as swe from "./sweph.js";
import { buildPanchang, buildMonth } from "./buildpanchang.js";
import { computeSky } from "./sky.js";
import { computeOrrery, computeTrails } from "./orrery.js";
import { computeKundali } from "./kundali.js";
import { offsetHours } from "./tz.js";

// Lazy one-time WASM init.
let _ready = null;
const ready = () => (_ready ||= swe.init());

// Bundled JSON loaders (extension-internal resources; each fetched once).
const _json = {};
function data(name) {
  if (!_json[name]) _json[name] = fetch(new URL(`../data/${name}`, import.meta.url)).then((r) => r.json());
  return _json[name];
}

function jdFromDate(dt) {
  const h = dt.getUTCHours() + dt.getUTCMinutes() / 60 + dt.getUTCSeconds() / 3600;
  return swe.julday(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), h);
}
// "YYYY-MM-DDTHH:MM[:SS]" wall time in `zone` -> UTC Date (DST-correct).
function localIsoToUTC(s, zone) {
  const m = String(s).match(/(\d+)-(\d+)-(\d+)[T ](\d+):(\d+)(?::(\d+))?/);
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  let off = offsetHours(new Date(wall), zone);
  let utc = wall - off * 3600000;
  off = offsetHours(new Date(utc), zone); utc = wall - off * 3600000;
  return new Date(utc);
}

// tz: explicit IANA name passes through; "auto" -> nearest bundled city's zone.
let _cities = null;
async function resolveZone(lat, lon, tz) {
  if (tz && tz !== "auto") return tz;
  if (!_cities) _cities = data("cities.json").then((d) => d.cities);
  const cs = await _cities;
  let best = null, bd = Infinity;
  for (const c of cs) { const dx = c[3] - lat, dy = c[4] - lon, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = c; } }
  return best ? best[5] : "UTC";
}

// --- the api.js surface ---------------------------------------------------
export function fetchStars() { return data("stars.json"); }
export function fetchConstellations() { return data("constellations.json"); }
export function fetchMessier() { return data("messier.json"); }
export async function fetchTz(lat, lon) { return { tz: await resolveZone(lat, lon, "auto") }; }

// Offline city search over the bundled list (mirrors /api/geocode; cities pre-sorted by pop).
export async function fetchGeocode(q) {
  if (!_cities) _cities = data("cities.json").then((d) => d.cities);
  const cs = await _cities, ql = String(q).trim().toLowerCase(), starts = [], contains = [];
  for (const c of cs) { const n = c[0].toLowerCase(); if (n.startsWith(ql)) starts.push(c); else if (n.includes(ql)) contains.push(c); }
  return { results: starts.concat(contains).slice(0, 12).map((c) => ({ name: c[0], admin1: c[1], country: c[2], lat: c[3], lon: c[4], tz: c[5] })) };
}

export async function fetchSky(lat, lon, date, ayanamsa = "lahiri") { await ready(); return computeSky(lat, lon, date, ayanamsa); }
export async function fetchOrrery(date, ayanamsa = "lahiri") { await ready(); return computeOrrery(date, ayanamsa); }
export async function fetchOrreryTrails(date, ayanamsa = "lahiri") { await ready(); return computeTrails(date, ayanamsa); }
export async function fetchAyanamsa(date, ayanamsa = "lahiri") {
  await ready();
  return { ayanamsa, ayanamsa_deg: Math.round(swe.ayanamsaDeg(jdFromDate(date), ayanamsa) * 10000) / 10000 };
}
export async function fetchPanchang(lat, lon, date, tz = "auto", ayanamsa = "lahiri") {
  await ready(); const zone = await resolveZone(lat, lon, tz);
  return buildPanchang(lat, lon, date, zone, ayanamsa);
}
export async function fetchMonth(year, month, lat, lon, tz = "auto", ayanamsa = "lahiri") {
  await ready(); const zone = await resolveZone(lat, lon, tz);
  return buildMonth(year, month, lat, lon, zone, ayanamsa);
}
export async function fetchKundali({ dt, lat, lon, tz = "auto", node = "mean", ayanamsa = "lahiri" }) {
  await ready(); const zone = await resolveZone(lat, lon, tz);
  const result = computeKundali(localIsoToUTC(dt, zone), lat, lon, { node, ayanamsa, zone });
  result.location = { lat, lon, tz: zone };
  return result;
}

// --- refetch policy + debounce (copied verbatim from api.js) ---------------
export const MIN_REFETCH_INTERVAL_MS = 333;
export function skyRefetchThresholdMs(flowRate) {
  const r = Math.abs(flowRate) || 1;
  return Math.min(120_000, Math.max(60_000, 60_000 * r));
}
export function needsSkyRefetch({ simMs, lastSimMs, lastRealMs, flowRate, now = Date.now() }) {
  if (lastSimMs == null) return true;
  if (Math.abs(simMs - lastSimMs) < skyRefetchThresholdMs(flowRate)) return false;
  if (now - lastRealMs < MIN_REFETCH_INTERVAL_MS) return false;
  return true;
}
export function debounce(fn, ms = 250) {
  let timer = null;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}
