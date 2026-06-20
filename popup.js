// Daily-Panchang popup. Computes the panchang locally (the seam) for the shared location + date/time
// (synced with the sky-map app via src/sync.js), offers city search / geolocation, and opens the
// full offline sky map in a tab.
import * as api from "./src/api-local.js";
import * as sync from "./src/sync.js";

const B = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);
const DEFAULT = { lat: 23.1765, lon: 75.7885, zone: "Asia/Kolkata", label: "Ujjain, India" };   // geolocation fallback
const SRC = "popup-" + Math.random().toString(36).slice(2);   // tag our writes so the app applies them
                                                              // (setSync merges, so we must override the app's _src)
const put = (patch) => sync.setSync({ ...patch, _src: SRC });

let current = null;   // shared sync object { lat, lon, zone, label, wall }
async function loadLoc() {
  if (current) return current;
  current = (await sync.getSync()) || { ...DEFAULT, wall: null };
  return current;
}

// "YYYY-MM-DDTHH:MM" wall clock in `tz` -> UTC Date (same two-pass DST handling as the app's state).
function tzOffsetMs(tz, date) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime();
}
function wallToUtc(wall, tz) {
  const naive = Date.parse(wall + ":00Z");
  let off = tzOffsetMs(tz, new Date(naive));
  off = tzOffsetMs(tz, new Date(naive - off));
  return new Date(naive - off);
}
// UTC Date -> "YYYY-MM-DDTHH:MM" wall clock in `tz` (to fill the date/time field).
function utcToWall(date, tz) {
  return new Date(date.getTime() + tzOffsetMs(tz, date)).toISOString().slice(0, 16);
}
// The instant the panchang is computed for: the pinned wall time (in the location's zone) or now.
function whenDate(loc) {
  return loc.wall ? wallToUtc(loc.wall, loc.zone || "UTC") : new Date();
}

async function pick(loc) {   // loc: { lat, lon, zone, label }
  current = await put(loc) || { ...current, ...loc };
  $("pp-locform").hidden = true;
  $("pp-city").value = "";
  render();
}

const hm = (iso) => { const m = iso && iso.match(/T(\d\d:\d\d)/); return m ? m[1] : ""; };
const row = (k, v, sub) => `<div class="pp-row"><span class="pp-k">${k}</span><span class="pp-v">${v}${sub ? `<span class="pp-next">${sub}</span>` : ""}</span></div>`;

async function render() {
  const loc = await loadLoc();
  $("pp-place").textContent = loc.label || `${loc.lat.toFixed(2)}, ${loc.lon.toFixed(2)}`;
  // Show the effective date/time: the pinned wall, else the current local time (so the field is
  // never blank). Leaving it untouched keeps "now"; editing it pins that instant.
  $("pp-dt").value = loc.wall || utcToWall(new Date(), loc.zone || "UTC");
  try {
    const p = await api.fetchPanchang(loc.lat, loc.lon, whenDate(loc), loc.zone || "auto", "lahiri");
    $("pp-date").textContent = `${p.date_local} · ${p.vara.replace(/ \(.*/, "")}`;
    const ti = p.tithi_at_sunrise, nk = p.nakshatra_at_sunrise;
    $("pp-body").innerHTML = [
      row("Tithi", ti.display, ti.ends_at_local ? `→ ends ${hm(ti.ends_at_local)}` : ""),
      row("Nakshatra", nk.name, nk.ends_at_local ? `→ ${hm(nk.ends_at_local)}` : ""),
      row("Yoga", p.yoga.name),
      row("Karana", p.karana.name),
      row("Masa", p.masa.name),
      row("Paksha", p.paksha),
      row("Samvatsara", p.samvatsara.name),
      row("Sunrise / Sunset", `${p.sun.sunrise_local} / ${p.sun.sunset_local}`),
      row("Ayanamsa", `${p.ayanamsa_deg}°`),
    ].join("");
  } catch (e) { $("pp-body").innerHTML = `<div class="pp-loading">Error: ${e.message}</div>`; }
}

$("pp-edit-loc").onclick = () => { const f = $("pp-locform"); f.hidden = !f.hidden; if (!f.hidden) $("pp-city").focus(); };
$("pp-open-app").onclick = () => { const url = B.runtime.getURL("app.html"); if (B.tabs?.create) B.tabs.create({ url }); else window.open(url, "_blank"); };

// Date/time (shared with the sky map).
$("pp-dt").addEventListener("change", async () => {
  const wall = $("pp-dt").value || null;       // "YYYY-MM-DDTHH:MM" in the location's zone
  current = await put({ wall }) || { ...current, wall };
  render();
});
$("pp-now").onclick = async () => {
  current = await put({ wall: null }) || { ...current, wall: null };
  render();
};

const cityInput = $("pp-city"), dl = $("pp-cities");
let cmap = new Map(), t = null;
const fromLabel = (c) => ({ lat: c.lat, lon: c.lon, zone: c.tz, label: `${c.name}, ${c.country}` });

cityInput.addEventListener("input", () => {
  const v = cityInput.value.trim();
  if (cmap.has(v)) { pick(fromLabel(cmap.get(v))); return; }   // a datalist option was chosen
  clearTimeout(t);
  if (v.length < 2) return;
  t = setTimeout(async () => {
    const r = await api.fetchGeocode(v);
    cmap = new Map();
    dl.innerHTML = r.results.map((c) => { const label = `${c.name}${c.admin1 ? ", " + c.admin1 : ""}, ${c.country}`; cmap.set(label, c); return `<option value="${label}"></option>`; }).join("");
  }, 200);
});
cityInput.addEventListener("change", () => { const c = cmap.get(cityInput.value.trim()); if (c) pick(fromLabel(c)); });

$("pp-geo").onclick = () => {
  const status = $("pp-tz");
  if (!navigator.geolocation) { status.textContent = "Geolocation unavailable in this browser."; return; }
  status.textContent = "Locating…";
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      const lat = +pos.coords.latitude.toFixed(4), lon = +pos.coords.longitude.toFixed(4);
      const tz = (await api.fetchTz(lat, lon)).tz;
      pick({ lat, lon, zone: tz, label: null });   // geo fix has no city name -> keep the City field blank (coords show in Lat/Lon)
    } catch (e) { status.textContent = "Error: " + e.message; }
  }, (err) => {
    status.textContent = err.code === 1
      ? "Location permission blocked — allow it, or just search your city above."
      : err.code === 3
      ? "No location fix. Desktop 'Use my location' needs a network service (offline here) — search your city instead."
      : "Couldn't get location: " + err.message;
  }, { enableHighAccuracy: false, timeout: 20000, maximumAge: 1800000 });
};

// If the sky map changes location/date-time while the popup is open, reflect it.
sync.onSyncChange((s) => { if (s && s._src !== SRC) { current = s; render(); } });

// One-shot geolocation -> { lat, lon, zone, label } or null (denied / timed out / offline).
function geolocateOnce(timeout) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const lat = +pos.coords.latitude.toFixed(4), lon = +pos.coords.longitude.toFixed(4);
        const tz = (await api.fetchTz(lat, lon)).tz;
        resolve({ lat, lon, zone: tz, label: null });   // geo fix has no city name -> blank City field
      } catch { resolve(null); }
    }, () => resolve(null), { enableHighAccuracy: false, timeout, maximumAge: 600000 });
  });
}

// On open: reuse the shared location if any; else TRY geolocation (wait), and only fall back to
// Ujjain if it fails -- don't go straight to the fallback.
async function start() {
  const s = await sync.getSync();
  if (s && s.lat != null) { current = s; render(); return; }
  $("pp-place").textContent = "Locating…";
  $("pp-body").innerHTML = `<div class="pp-loading">Locating… (using Ujjain if this fails)</div>`;
  const loc = await geolocateOnce(8000);
  // Persist ONLY a real fix (sticky once it succeeds). The Ujjain fallback is shown but NOT saved,
  // so geolocation is retried on the next start until it succeeds (or the user picks a city).
  if (loc) current = (await put(loc)) || { ...loc, wall: null };
  else current = { ...DEFAULT, wall: null };
  render();
}

start();
