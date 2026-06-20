// main.js -- bootstrap: geolocation + time, then (Phase 6+) view wiring.

import * as api from "./api.js";
import * as astro from "./astro.js";
import * as state from "./state.js";
import { createView3D } from "./view3d.js";
import { createView2D } from "./view2d.js";
import { createOrrery } from "./orrery.js";
import { createViewBar, createOverlayBar, createControlBar } from "./ui.js";
import { loadSettings, createSettingsPanel } from "./settings.js";
import * as i18n from "./i18n.js";
import { exportView } from "./export.js";
import { initInfoPanel, showInfo, hideInfo, setSearchNames } from "./infopanel.js";
import { createPanchangTab } from "./panchang.js";
import { createCalendar } from "./calendar.js";
import { createKundali } from "./kundali.js";
import * as overlays from "./overlays.js";
import * as sync from "../src/sync.js";
import * as sev from "../src/savedevents.js";

const UJJAIN = { lat: 23.1765, lon: 75.7885, tz: "Asia/Kolkata", label: "Ujjain, India" };

// Smooth-mode time-lapse presets (Section 5.1), capped at 1 day/s in the sky views.
const RATE_PRESETS = [0, 1, 60, 600, 3600, 21600, 86400];
// Orrery has no diurnal spin to alias -> unlocks higher rates (Section 7D.2): up to 10 yr/s.
const ORRERY_PRESETS = [0, 1, 86400, 604800, 2592000, 31557600, 315576000];

export function toast(msg) {
  const el = typeof document !== "undefined" && document.getElementById("toast");
  if (el) {
    el.textContent = msg;
    el.hidden = false;
    setTimeout(() => { el.hidden = true; }, 4000);
  }
  console.info("[toast]", msg);
}

// Geolocation with a 5 s timeout and a silent, robust Ujjain fallback (Section 5.2).
// Geolocation needs a secure context; localhost is secure but a LAN IP is not.
export function bootstrapLocation() {
  const fallback = () => {
    toast("Using Ujjain (geolocation unavailable)");
    return { ...UJJAIN, source: "fallback" };
  };
  if (typeof navigator === "undefined" || !("geolocation" in navigator) ||
      (typeof window !== "undefined" && window.isSecureContext === false)) {
    return Promise.resolve(fallback());
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone || UJJAIN.tz,
        source: "geolocation",
      }),
      () => resolve(fallback()),
      { timeout: 8000, maximumAge: 600000 },   // wait for a fix before falling back to Ujjain
    );
  });
}

// --- render loop state ----------------------------------------------------
let view3d = null, view2d = null, orreryView = null;
const containers = {};
let sky = null;
let lstFetched = 0, simAtFetch = 0, lastRealFetch = 0, lastFrame = 0, fetching = false;
let fps = 0, fpsAccum = 0, fpsFrames = 0;
let ayanamsaDeg = 0;
let orreryAt = null, orreryRealFetch = 0, orreryFetching = false, orreryTrailMonth = null, orreryStarted = false;
let orreryTrailFetch = 0;
let orreryLog = false, deepTimeOn = false;
let deepTimePanel = null, deepTimeSlider = null, deepTimeYearEl = null, deepTimeSpeedEl = null;
// Deep-time playback: stepped speeds (yr/s); each forward/reverse click bumps to the next.
const DT_SPEEDS = [250, 1000, 5000, 25000];
let dtDir = 0, dtIdx = 0, dtRaf = 0, dtLast = 0, dtYear = 2000;  // dtYear: continuous float epoch
let atEphemerisLimit = false;
let panchangTab = null, calendarView = null;
let panchangFrozen = false, panchangFetching = false, panchangAtSim = null, panchangTick = 0;
let kundaliView = null, controlBar = null;

function viewObj(v) {
  return v === "2d" ? view2d : v === "orrery" ? orreryView : view3d;
}

// Per-view caption naming the key on-screen elements (helps newcomers read the view).
// Stellarium-style time-lapse keys, spelled out (J/L step through the rate presets; K resets
// to live real-time). Grid (G) is sky-only; time-lapse applies to all three viewer modes.
const TIME_KEYS = "time-lapse — J ◀ slower / reverse · L ▶ faster · K = back to live now";

const HINTS = {
  "3d": `3D sky — drag to look, wheel to zoom. The dark dome below is the ground; the horizon (N/E/S/W) is where it meets the sky. ${TIME_KEYS} · G = grid · "Deep time" drifts the stars / changes the pole star over millennia`,
  "2d": `2D dome — looking straight up. Centre = zenith, the circle = horizon, N/E/S/W around the rim. Drag to rotate · wheel to zoom. ${TIME_KEYS} · G = grid · "Deep time" warps the constellations over millennia`,
  "orrery": `Solar System — planets orbit the Sun (centre). Arrow keys: ←→ swing, ↑↓ tilt (or drag) · wheel to zoom · double-click a body to follow. Toggle "Rashi band" for the geocentric zodiac (Earth→body lines + Spica axis). ${TIME_KEYS} (up to 10 yr/s)`,
  "panchang": "Panchang — today's Hindu calendar for your location. Use Today / Month above. Frozen during time-lapse.",
  "kundali": "Kundali — South-Indian birth chart. Enter birth date / time / place and cast. Signs are fixed; occupants move. Data stays on your device.",
};
function setHint(v) {
  const el = document.querySelector(".hint");
  if (el) el.textContent = HINTS[v] || "";
}

// The three top bars stack natively in the #top-bars flex column (CSS), so they can't overlap
// at any width. This only measures the column's bottom edge -> --panel-top, so the scrollable
// panel views (Panchang/Kundali) start below whatever the bars currently occupy. Run after layout.
function layoutBars() {
  const bars = document.getElementById("top-bars");
  if (!bars) return;
  // Collapsed -> panel views reclaim the space (only the small tab remains at top).
  if (document.body.classList.contains("bars-hidden")) {
    document.documentElement.style.setProperty("--panel-top", "24px");
    return;
  }
  document.documentElement.style.setProperty("--panel-top", `${Math.ceil(bars.getBoundingClientRect().bottom + 8)}px`);
}

// Top-middle tab: click toggles the menus; hovering the tab/bars peeks them while hidden.
function setupBarsHandle() {
  const handle = document.getElementById("bars-handle");
  const bars = document.getElementById("top-bars");
  if (!handle || !bars) return;
  const sync = () => {
    const hidden = document.body.classList.contains("bars-hidden");
    handle.textContent = hidden ? "▼" : "▲";
    handle.title = hidden ? "Show menus" : "Hide menus";
    requestAnimationFrame(layoutBars);
  };
  handle.addEventListener("click", () => {
    document.body.classList.toggle("bars-hidden");
    document.body.classList.remove("bars-peek");
    sync();
  });
  // Peek while hovering (a short close delay bridges the gap between tab and bars).
  let peekT;
  const peek = (on) => {
    clearTimeout(peekT);
    if (on) document.body.classList.add("bars-peek");
    else peekT = setTimeout(() => document.body.classList.remove("bars-peek"), 160);
  };
  handle.addEventListener("mouseenter", () => peek(true));
  handle.addEventListener("mouseleave", () => peek(false));
  bars.addEventListener("mouseenter", () => peek(true));
  bars.addEventListener("mouseleave", () => peek(false));
  sync();
}

const fmtYear = (y) => { y = Math.round(y); return y >= 0 ? `${y} CE` : `${-y} BCE`; };

// Deep-time scrubber: drag the slider, or use ◀ ⏸ ▶ to auto-drift (each ◀/▶ click steps speed).
function setupDeepTime() {
  const p = document.createElement("div");
  p.className = "deeptime-panel"; p.hidden = true;
  // Single-line bottom bar. The caveats live in the hover tooltip to keep it uncluttered.
  p.title = "Deep time: stars drift by their true proper motion (Hipparcos) + radial velocity; "
    + "precession is the uniform approximation. Galactic curvature grows past ±50,000 yr; "
    + "planets & panchang are hidden here.";
  p.innerHTML = `<span class="dt-cap">🌌 Deep time</span>
    <button class="dt-btn" data-dt="rev" title="reverse (click again = faster)">◀</button>
    <button class="dt-btn" data-dt="pause" title="pause">⏸</button>
    <button class="dt-btn" data-dt="fwd" title="forward (click again = faster)">▶</button>
    <input type="range" class="dt-slider" min="-48000" max="52000" step="1" value="2000" />
    <span class="dt-year"></span>
    <span class="dt-speed"></span>`;
  document.body.appendChild(p);
  deepTimePanel = p;
  deepTimeSlider = p.querySelector(".dt-slider");
  deepTimeYearEl = p.querySelector(".dt-year");
  deepTimeSpeedEl = p.querySelector(".dt-speed");
  const apply = () => {
    const y = +deepTimeSlider.value; deepTimeYearEl.textContent = fmtYear(y);
    if (!deepTimeOn) return;                 // never drift while off (keeps normal mode untouched)
    const dv = deepView(); if (dv && dv.setEpoch) dv.setEpoch(y);
  };
  // Manual drag takes over -> pause playback and resync the float accumulator.
  deepTimeSlider.addEventListener("input", () => { stopDeepPlayback(); dtYear = +deepTimeSlider.value; apply(); });
  for (const b of p.querySelectorAll(".dt-btn")) {
    b.addEventListener("click", () => deepPlay(b.dataset.dt));
  }
  updateDtSpeed();
  apply();
}

function updateDtSpeed() {
  if (!deepTimeSpeedEl) return;
  deepTimeSpeedEl.textContent = dtDir === 0 ? "paused"
    : `${dtDir < 0 ? "◀" : "▶"} ${DT_SPEEDS[dtIdx].toLocaleString()} yr/s`;
  if (deepTimePanel) for (const b of deepTimePanel.querySelectorAll(".dt-btn")) {
    const on = (b.dataset.dt === "fwd" && dtDir > 0) || (b.dataset.dt === "rev" && dtDir < 0)
      || (b.dataset.dt === "pause" && dtDir === 0);
    b.classList.toggle("active", on);
  }
}

function stopDeepPlayback() {
  dtDir = 0; if (dtRaf) { cancelAnimationFrame(dtRaf); dtRaf = 0; } updateDtSpeed();
}

// ◀/▶: start (or speed up) auto-drift; ⏸: stop.
function deepPlay(which) {
  if (which === "pause") { stopDeepPlayback(); return; }
  const dir = which === "fwd" ? 1 : -1;
  if (dtDir === 0) dtYear = +deepTimeSlider.value;   // resume from the current slider position
  if (dtDir !== dir) { dtDir = dir; dtIdx = 0; }
  else dtIdx = (dtIdx + 1) % DT_SPEEDS.length;     // same direction again -> next speed (wraps)
  updateDtSpeed();
  dtLast = 0;
  if (!dtRaf) dtRaf = requestAnimationFrame(dtTick);
}

function dtTick(now) {
  if (dtDir === 0 || !deepTimeOn || !deepCapable()) { dtRaf = 0; return; }
  const dt = dtLast ? Math.min(0.1, (now - dtLast) / 1000) : 0;
  dtLast = now;
  const min = +deepTimeSlider.min, max = +deepTimeSlider.max;
  // Accumulate in a float (dtYear), NOT by reading back the step-snapped slider -- otherwise
  // sub-step-per-frame speeds (250/1000 yr/s) round away and never advance.
  dtYear += dtDir * DT_SPEEDS[dtIdx] * dt;
  // Only stop when overshooting in the CURRENT direction, so the opposite button frees it again
  // (and the first frame's dt=0 sitting at the edge doesn't immediately re-pause).
  if (dtDir > 0 && dtYear >= max) { dtYear = max; dtDir = 0; }
  else if (dtDir < 0 && dtYear <= min) { dtYear = min; dtDir = 0; }
  deepTimeSlider.value = dtYear;
  deepTimeYearEl.textContent = fmtYear(dtYear);
  const dv = deepView(); if (dv && dv.setEpoch) dv.setEpoch(dtYear);
  if (dtDir !== 0) dtRaf = requestAnimationFrame(dtTick); else { dtRaf = 0; updateDtSpeed(); }
}

// The deep-time-capable view object for the current view (3D sky, 2D dome, or orrery).
function deepView() {
  const v = state.get("view");
  return v === "3d" ? view3d : v === "2d" ? view2d : v === "orrery" ? orreryView : null;
}
function deepCapable() { const dv = deepView(); return dv && dv.setDeepTime; }

function showDeepPanel(show) {
  if (!deepTimePanel) return;
  deepTimePanel.hidden = !show;
  document.body.classList.toggle("deeptime-open", show);   // hides the bottom hint line
}

function setDeepTime(on) {
  deepTimeOn = on;
  if (!on) stopDeepPlayback();
  const dv = deepView();
  if (dv && dv.setDeepTime) dv.setDeepTime(on);
  showDeepPanel(on && deepCapable());
  if (on && dv && dv.setEpoch && deepTimeSlider) dv.setEpoch(+deepTimeSlider.value);
}

// On view change, re-apply the global deep-time state to whichever view we entered.
function syncDeepTimeView() {
  if (!(deepTimeOn && deepCapable())) stopDeepPlayback();   // left a deep-capable view
  const dv = deepView();
  if (dv && dv.setDeepTime) {
    dv.setDeepTime(deepTimeOn);
    if (deepTimeOn && dv.setEpoch && deepTimeSlider) dv.setEpoch(+deepTimeSlider.value);
  }
  showDeepPanel(deepTimeOn && deepCapable());
}

// Show the container for the current view, hide the others, resize the shown one.
function applyView(v) {
  for (const key of ["3d", "2d", "orrery", "panchang", "kundali"]) containers[key].hidden = (key !== v);
  if (v === "3d" || v === "2d" || v === "orrery") viewObj(v).resize();
  setHint(v);
  if (v === "orrery") refetchOrrery(true);
  else if (v === "panchang") refetchPanchang(true);
  else if (v === "kundali") enterKundali();
  else if (v === "3d" || v === "2d") refetchSky(true);   // sync sky to the current sim clock on entry
  // Leaving the orrery steps the rate back down to <= 1 day/s (Section 7D.2 item 6).
  if (v !== "orrery" && Math.abs(state.get("timeFlowRate")) > 86400) setRate(86400);
}

async function refetchOrrery(force = false) {
  if (orreryFetching && !force) return;
  orreryFetching = true; orreryRealFetch = Date.now();
  try {
    const when = state.simTime();
    const data = await api.fetchOrrery(when, state.get("ayanamsa"));
    if (!state.get("telescopic")) data.bodies = data.bodies.filter((b) => b.id !== "uranus" && b.id !== "neptune");
    // Use the ayanamsa AT THIS instant so the 0° Aries line tracks time-travel (Section 7B).
    if (data.ayanamsa_deg != null) ayanamsaDeg = data.ayanamsa_deg;
    orreryView.setData(data); orreryView.setAries(ayanamsaDeg);
    orreryAt = when.getTime();
    // Orbits are closed ellipses, so an outdated trail still shows the full orbit -- refetch
    // only on a month change AND at most every ~2 s real (avoids thrash at high time-lapse).
    const mk = when.toISOString().slice(0, 7);
    if (mk !== orreryTrailMonth && Date.now() - orreryTrailFetch > 2000) {
      orreryTrailMonth = mk; orreryTrailFetch = Date.now();
      orreryView.setTrails(await api.fetchOrreryTrails(when, state.get("ayanamsa")));
    }
    orreryStarted = true;
  } finally {
    orreryFetching = false;
  }
}

async function refetchSky(force = false) {
  if (fetching && !force) return;
  fetching = true;
  lastRealFetch = Date.now();
  try {
    const when = state.simTime();
    sky = await api.fetchSky(state.get("lat"), state.get("lon"), when, state.get("ayanamsa"));
    if (!state.get("telescopic")) sky.bodies = sky.bodies.filter((b) => b.id !== "uranus" && b.id !== "neptune");
    lstFetched = sky.lst_hours;
    simAtFetch = when.getTime();
    sky._fetchMs = when.getTime();   // anchor for per-frame orbital interpolation in the views
    view3d.setSky(sky);
    view2d.setSky(sky);
    // Regenerate the of-date ecliptic/Rashi band for THIS instant (ayanamsa + obliquity drift
    // with time -> the band must track the planets, not the session-start epoch).
    if (sky.ayanamsa_deg != null) {
      ayanamsaDeg = sky.ayanamsa_deg;
      const jd = astro.jdFromDate(when);
      view3d.setEcliptic(ayanamsaDeg, jd);
      view2d.setEcliptic(ayanamsaDeg, jd);
    }
  } finally {
    fetching = false;
  }
}

function loop(now) {
  const dtReal = now - lastFrame;
  lastFrame = now;

  // Advance sim time by the flow rate (Section 5.1) unless pinned to an instant.
  const rate = state.get("timeFlowRate");
  const st = state.getState();
  if (!st.pinnedTime && rate !== 1) {
    st.timeOffsetMs += dtReal * (rate - 1);
    // Pin cleanly at the DE440s boundary instead of running the offset off into space.
    const raw = Date.now() + st.timeOffsetMs;
    const hitMax = raw > state.EPHEMERIS_MAX, hitMin = raw < state.EPHEMERIS_MIN;
    atEphemerisLimit = hitMax || hitMin;
    if (hitMax) st.timeOffsetMs = state.EPHEMERIS_MAX - Date.now();
    else if (hitMin) st.timeOffsetMs = state.EPHEMERIS_MIN - Date.now();
    // Park (pause) on arrival instead of grinding against the wall -- so one J/K/L press
    // reverses out (otherwise a fast rate stays pinned and reversing seems frozen).
    if ((hitMax && rate > 0) || (hitMin && rate < 0)) setRate(0);
  } else {
    atEphemerisLimit = false;
  }
  const simDate = state.simTime();
  const view = state.get("view");

  if (view === "orrery") {
    if (orreryStarted && api.needsSkyRefetch({ simMs: simDate.getTime(), lastSimMs: orreryAt,
        lastRealMs: orreryRealFetch, flowRate: rate })) {
      refetchOrrery();
    }
    orreryView.frame();
  } else if (view === "panchang") {
    managePanchang(simDate);            // DOM panel, no canvas render
  } else if (view === "kundali") {
    /* DOM panel, self-managed via the birth form */
  } else {
    if (api.needsSkyRefetch({ simMs: simDate.getTime(), lastSimMs: simAtFetch,
        lastRealMs: lastRealFetch, flowRate: rate })) {
      refetchSky();
    }
    // LST advanced client-side from the last fetch -> smooth 60 FPS rotation.
    const lst = astro.advanceLst(lstFetched, (simDate.getTime() - simAtFetch) / 1000);
    viewObj(view).frame(lst, state.get("lat"), simDate, state.get("atmosphere"));
  }

  fpsAccum += dtReal; fpsFrames++;
  if (fpsAccum >= 500) {
    fps = Math.round(1000 * fpsFrames / fpsAccum); fpsAccum = 0; fpsFrames = 0;
    updateHud(simDate);
    if (controlBar) controlBar.tickTime();   // keep the date/time fields on the moving instant
  }
  requestAnimationFrame(loop);
}

// Format an instant in the OBSERVED LOCATION's timezone (not the browser's), honoring 12/24h.
function locLocalLabel(date) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: state.get("tz"), year: "numeric", month: "short", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: state.get("timeFormat") === "12h",
    }).format(date).replace(",", "");
  } catch {
    return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
  }
}

function updateHud(simDate) {
  const hud = typeof document !== "undefined" && document.getElementById("hud");
  if (!hud) return;
  const rate = state.get("timeFlowRate");
  const rateStr = rate === 1 ? "" : rate === 0 ? " ⏸"
    : ` ${rate < 0 ? "◀◀" : "▶▶"} ${rateLabel(rate)}`;
  const limit = atEphemerisLimit ? "  ⛔ ephemeris limit (1849–2149)" : "";
  const debug = new URLSearchParams(location.search).has("debug") ? ` · ${fps} FPS` : "";
  const line1 = `${locLocalLabel(simDate)} · ${state.get("tz")}${rateStr}${limit}${debug}`;
  // Second line: where the view is pointing / zoomed (exact degrees, alt-az / orrery tilt-spin-zoom).
  const v = state.get("view");
  const vo = viewObj(v);
  const orient = (vo && vo.getOrientation && (v === "3d" || v === "2d" || v === "orrery")) ? vo.getOrientation() : "";
  hud.innerHTML = `${line1}${orient ? `<br><span class="hud-orient">${orient}</span>` : ""}`;
}

// Overlay toggles applied to both views (and mirrored into state for persistence).
const OVERLAY_METHOD = {
  constellations: "toggleConstellations", rashi: "toggleRashi",
  messier: "toggleMessier", milkyway: "toggleMilkyway", grid: "toggleGrid",
  stars: "toggleStars",
};
// `stars` defaults ON (the field is the catalog stars; hide them to focus on Sun/Moon/planets).
const overlayState = { constellations: false, rashi: false, messier: false, milkyway: false, grid: false, stars: true };
function setOverlay(key, val) {
  overlayState[key] = val;
  const m = OVERLAY_METHOD[key];
  view3d[m](val); view2d[m](val);
  // The Rashi band and the star field also exist in the orrery, driven by the same toggles.
  if (key === "rashi" && orreryView) orreryView.setRashiBand(val);
  if (key === "stars" && orreryView) orreryView.toggleStars(val);
  if (key !== "grid") state.set("overlays", { ...state.get("overlays"), [key]: val });
}

// Stellarium-style time-lapse keys: J slower/reverse, K pause/now, L faster (Section 5.1).
// Sky views cap at 1 day/s; the orrery unlocks up to 10 yr/s (Section 7D.2).
function setRate(r) {
  const cap = state.get("view") === "orrery" ? 315576000 : 86400;
  state.set("timeFlowRate", Math.max(-cap, Math.min(cap, r)));
}

const _RATE_LABELS = [
  [315576000, "10 yr/s"], [31557600, "1 yr/s"], [2592000, "1 mo/s"], [604800, "1 wk/s"],
  [86400, "1 day/s"], [21600, "6 hr/s"], [3600, "1 hr/s"], [600, "10 min/s"], [60, "1 min/s"],
];
function rateLabel(r) {
  const a = Math.abs(r);
  for (const [v, l] of _RATE_LABELS) if (a === v) return l;
  return `${a}×`;
}
// True when the user is typing into an editable element -- shortcuts must yield so e.g.
// the "l" in "Berlin" goes into the City box instead of starting time-lapse.
function isTypingTarget(t) {
  if (!t) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
function onKey(e) {
  // Esc deselects (clears the ✦ marker / highlight) -- handled before the typing guard so it
  // works even while the search box still has focus, where it also blurs the field.
  if (e.key === "Escape") { clearActiveSelection(); if (isTypingTarget(e.target)) e.target.blur(); return; }
  // Ignore keystrokes aimed at a text field, and any modifier combo (Ctrl/Cmd/Alt) so
  // browser/OS shortcuts (Ctrl+L address bar, etc.) are never hijacked.
  if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
  const rate = state.get("timeFlowRate");
  if (e.key === "k" || e.key === "K") { state.resetToNow(); }
  else if (e.key === "l" || e.key === "L") { setRate(stepRate(rate, +1)); }
  else if (e.key === "j" || e.key === "J") { setRate(stepRate(rate, -1)); }
  else if (e.key === "g" || e.key === "G") { setOverlay("grid", !overlayState.grid); }
}
function stepRate(rate, dir) {
  const base = state.get("view") === "orrery" ? ORRERY_PRESETS : RATE_PRESETS;
  const presets = [...base.map((r) => -r), ...base].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);
  let i = presets.indexOf(rate);
  if (i === -1) return dir > 0 ? base[2] : -base[2];
  return presets[Math.max(0, Math.min(presets.length - 1, i + dir))];
}

// --- Panchang dashboard (Phase 9) ----------------------------------------
async function refetchPanchang(force = false) {
  if (panchangFetching && !force) return;
  panchangFetching = true;
  try {
    const when = state.simTime();
    const data = await api.fetchPanchang(state.get("lat"), state.get("lon"), when,
      state.get("tz"), state.get("ayanamsa"));
    panchangAtSim = when.getTime();
    panchangTab.update(data, when.getTime());
  } catch (e) {
    console.warn("panchang fetch failed:", e.message);
  } finally {
    panchangFetching = false;
  }
}

// Honor the Section 5.4 freeze rule: fetch/tick only when time is at rest; otherwise show
// the paused banner and refetch once on return to rest.
function managePanchang(simDate) {
  if (state.timeAtRest()) {
    if (panchangFrozen) { panchangFrozen = false; refetchPanchang(true); }
    else if (panchangAtSim == null || Math.abs(simDate.getTime() - panchangAtSim) > 6 * 3600 * 1000) refetchPanchang();
    const now = Date.now();
    if (now - panchangTick > 1000) { panchangTick = now; panchangTab.tick(simDate.getTime()); }
  } else if (!panchangFrozen) {
    panchangFrozen = true;
    panchangTab.showPaused(locLocalLabel(simDate));
  }
}

// Pick a day in the month grid -> pin sim time to ~local noon and show the dashboard.
function onPickDay(dateStr) {
  const [y, mo, da] = dateStr.split("-").map(Number);
  const noonUtc = ((12 - state.get("lon") / 15) + 24) % 24;   // ~solar noon at the location
  const hh = Math.floor(noonUtc), mm = Math.round((noonUtc - hh) * 60);
  state.pinTime(new Date(Date.UTC(y, mo - 1, da, hh, mm)));
  state.set("timeFlowRate", 0);
  showPanchangSub("today");
  refetchPanchang(true);
}

function showPanchangSub(which) {
  document.getElementById("pj-today").hidden = which !== "today";
  document.getElementById("pj-month").hidden = which !== "month";
  document.getElementById("pj-saved").hidden = which !== "saved";
  document.querySelectorAll(".pj-sub").forEach((b) => b.classList.toggle("active", b.dataset.sub === which));
  if (which === "month") {
    const d = state.simTime();
    calendarView.show(d.getUTCFullYear(), d.getUTCMonth() + 1);
  }
}

// --- saved events (location/date/time anchors; tithi+masa recurrence) --------------------------
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Restore a saved event's location + date/time into the app (then the user can view its
// Kundali / Panchang / sky map). Tagged as a sync apply so it propagates to the popup too.
function loadSavedEvent(ev) {
  applyingSync = true;
  try {
    state.set("lat", ev.lat); state.set("lon", ev.lon); if (ev.zone) state.set("tz", ev.zone);
    controlBar.setLatLon(ev.lat, ev.lon);
    if (ev.wall) { state.setWallTime(ev.wall); controlBar.setDateTime(state.simTime()); state.set("timeFlowRate", 0); }
  } finally { applyingSync = false; }
  pushLocation(ev.label || null);   // share the event's location (label) + date/time to the popup
  pushTime(ev.wall || null);
  refetchCurrent();
}

async function saveCurrentEvent() {
  const tz = state.get("tz"), lat = state.get("lat"), lon = state.get("lon");
  let p;
  try { p = await api.fetchPanchang(lat, lon, state.simTime(), tz, state.get("ayanamsa")); }
  catch (e) { toast("Couldn't read the panchang to save: " + e.message); return; }
  const def = `${p.masa.name} ${p.paksha} ${p.tithi_at_sunrise.name}`;
  const label = (prompt("Name this saved date:", def) || "").trim();
  if (!label) return;
  await sev.addEvent({
    label, lat, lon, zone: tz, wall: state.utcToWall(state.simTime(), tz),
    masa: p.masa.name, paksha: p.paksha, tithi_name: p.tithi_at_sunrise.name, tithi_n: p.tithi_at_sunrise.number,
  });
  renderSavedPanel();
  toast(`Saved "${label}"`);
}

async function renderSavedPanel() {
  const events = await sev.listEvents();
  panchangTab.setSavedEvents(events);
  calendarView.setSavedEvents(events);
  const host = document.getElementById("pj-saved");
  if (!host) return;
  host.innerHTML = `<div class="se-head"><button class="se-save" type="button">💾 Save current date &amp; location</button></div>
    <div class="se-list"></div>
    <p class="se-hint">Saved dates recur by <b>tithi + masa</b> (yearly) and are marked ★ in Today and the Month calendar. Load restores the location + date/time for Kundali / Panchang / sky map.</p>`;
  host.querySelector(".se-save").onclick = saveCurrentEvent;
  const list = host.querySelector(".se-list");
  list.innerHTML = events.length ? events.map((e) => `
    <div class="se-row" data-id="${e.id}">
      <div class="se-main"><span class="se-label">${escapeHtml(e.label)}</span>
        <span class="se-meta">${escapeHtml(e.masa)} ${escapeHtml(e.paksha)} ${escapeHtml(e.tithi_name)} · ${e.wall ? e.wall.replace("T", " ") : "now"} · ${(+e.lat).toFixed(2)}, ${(+e.lon).toFixed(2)}</span></div>
      <div class="se-actions"><button class="se-load" type="button">Load</button><button class="se-del" type="button" title="delete">✕</button></div>
    </div>`).join("") : `<div class="se-empty">No saved dates yet — open a date/location and click “Save”.</div>`;
  list.querySelectorAll(".se-row").forEach((row) => {
    const ev = events.find((e) => e.id === row.dataset.id);
    row.querySelector(".se-load").onclick = () => { loadSavedEvent(ev); showPanchangSub("today"); };
    row.querySelector(".se-del").onclick = async () => { await sev.removeEvent(ev.id); renderSavedPanel(); };
  });
  renderSavedMenu();   // keep the control-bar dropdown in step
}

// A compact "★ Saved" dropdown in the unified control bar, so Save/Load work from ANY view
// (sky / panchang / kundali), not just the Panchang > Saved tab.
function setupSavedMenu() {
  const bar = document.querySelector(".control-bar");
  if (!bar || document.getElementById("cb-saved")) return;
  const grp = document.createElement("span");
  grp.className = "cb-grp cb-saved"; grp.id = "cb-saved";
  grp.innerHTML = `<button id="cb-saved-btn" type="button" title="saved dates / locations">★ Saved</button>
    <div id="cb-saved-menu" class="cb-saved-menu" hidden></div>`;
  bar.appendChild(grp);
  const btn = grp.querySelector("#cb-saved-btn"), menu = grp.querySelector("#cb-saved-menu");
  btn.onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; if (!menu.hidden) renderSavedMenu(); };
  document.addEventListener("click", (e) => { if (!grp.contains(e.target)) menu.hidden = true; });
}

async function renderSavedMenu() {
  const menu = document.getElementById("cb-saved-menu");
  if (!menu) return;
  const events = await sev.listEvents();
  menu.innerHTML = `<button class="cb-sm-save" type="button">💾 Save current</button>`
    + (events.length ? events.map((e) => `<div class="cb-sm-row" data-id="${e.id}">
        <button class="cb-sm-load" type="button" title="load location + date/time"><b>${escapeHtml(e.label)}</b><small>${escapeHtml(e.masa)} ${escapeHtml(e.paksha)} ${escapeHtml(e.tithi_name)}</small></button>
        <button class="cb-sm-del" type="button" title="delete">✕</button></div>`).join("")
      : `<div class="cb-sm-empty">No saved dates yet.</div>`);
  menu.querySelector(".cb-sm-save").onclick = async () => { menu.hidden = true; await saveCurrentEvent(); };
  menu.querySelectorAll(".cb-sm-row").forEach((row) => {
    const ev = events.find((e) => e.id === row.dataset.id);
    row.querySelector(".cb-sm-load").onclick = () => { menu.hidden = true; loadSavedEvent(ev); toast(`Loaded "${ev.label}"`); };
    row.querySelector(".cb-sm-del").onclick = async (e) => { e.stopPropagation(); await sev.removeEvent(ev.id); renderSavedPanel(); };
  });
}

// Click-to-identify + hover cursor on every view (Phase 8).
function setupPicking() {
  let hoverTs = 0;
  for (const key of ["3d", "2d", "orrery"]) {
    const c = containers[key];
    let dx = 0, dy = 0, dt = 0;
    c.addEventListener("pointerdown", (e) => { dx = e.clientX; dy = e.clientY; dt = Date.now(); });
    c.addEventListener("pointerup", (e) => {
      if (Date.now() - dt > 400 || Math.hypot(e.clientX - dx, e.clientY - dy) > 5) return;  // it was a drag
      const view = viewObj(state.get("view"));
      const desc = view.pickAt(e.clientX, e.clientY);
      view.setSelected(desc || null);
      desc ? showInfo(desc) : hideInfo();
    });
    c.addEventListener("pointermove", (e) => {
      const now = Date.now();
      if (now - hoverTs < 60) return;            // throttle hover (Section 8 item 1)
      hoverTs = now;
      c.style.cursor = viewObj(state.get("view")).pickAt(e.clientX, e.clientY) ? "pointer" : "default";
    });
  }
}

// Refetch whatever the current view needs (after a location/time change).
function refetchCurrent() {
  const v = state.get("view");
  if (v === "panchang") refetchPanchang(true);
  else if (v === "orrery") refetchOrrery(true);
  else if (v === "kundali") castKundali();
  else if (v === "3d" || v === "2d") refetchSky(true);
}

// Cast the Kundali from the shared bar's birth fields + current observer location/tz.
function castKundali() {
  if (!kundaliView) return;
  const b = controlBar.getBirth();
  kundaliView.cast({
    date: b.date, time: b.time, node: state.get("node"), ayanamsa: state.get("ayanamsa"),
    // tz:"auto" lets the backend resolve the birth tz with the SAME timezonefinder that /api/tz
    // (hence state.tz, hence the sky clock) uses -- so the Kundali and the sky agree by construction.
    lat: state.get("lat"), lon: state.get("lon"), tz: "auto",
  });
}

// Entering Kundali: if no birth date is set yet, restore the last saved chart into the bar.
function enterKundali() {
  // Unified model: the Kundali uses the SAME shared location + date/time as every other view (the
  // bar already shows the current instant). Just cast for it -- to view a specific chart, pin that
  // date/time in the bar (it applies everywhere).
  castKundali();
}

// PNG export (Phase 9D.4): footer caption for the snapshot (location + local time, or
// "Solar System" + sim time for the orrery).
function exportLabel() {
  const t = locLocalLabel(state.simTime());
  if (state.get("view") === "orrery") return `Solar System · ${t}`;
  return `${state.get("lat").toFixed(2)}°, ${state.get("lon").toFixed(2)}° · ${t} · ${state.get("tz")}`;
}
// PWA (Phase 9D.3): register the service worker + an offline banner driven by connectivity.
function registerPWA() {
  if ("serviceWorker" in navigator) {
    /* no service worker in the extension */
  }
  const banner = document.getElementById("offline-banner");
  const upd = () => { if (banner) banner.hidden = navigator.onLine; };
  window.addEventListener("online", upd); window.addEventListener("offline", upd); upd();
}

// Language relabel (Phase 9D.2): load the bundle, relabel static chrome, re-render the
// dynamic views so backend anga names are localized via i18n.tr().
// Re-bake sky/orrery object labels (planets -> grahas, anchor stars -> nakshatras). view2d
// redraws every frame so it picks up the change automatically; nothing to do there.
function relabelObjects() { view3d.relabelBodies(); orreryView.relabelObjects(); }

async function applyLanguage(lang) {
  await i18n.loadLang(lang);
  relabelStatic();
  relabelObjects();
  const v = state.get("view");
  if (v === "panchang") refetchPanchang(true);
  else if (v === "kundali") castKundali();
}
function relabelStatic() {
  document.querySelectorAll(".pj-sub").forEach((b) => {
    b.textContent = i18n.label(b.dataset.sub === "month" ? "month" : "today", b.textContent);
  });
}

// Deselect: drop the highlight/✦ marker in the active view (restoring a hidden star label),
// close the info panel, and clear the search box. Wired to the panel × and the Esc key.
function clearActiveSelection() {
  const view = viewObj(state.get("view"));
  if (view && view.clearSelection) view.clearSelection();
  hideInfo();
  const search = document.getElementById("obj-search");
  if (search) search.value = "";
}

function onSelectName(name) {
  const v = state.get("view");
  const view = viewObj(v);
  // Accept Hindu names (e.g. "Chandra", "Chitra") by mapping them to the English object first.
  const resolved = i18n.englishForHindu(name) || name;
  const desc = view.findByName(resolved);
  if (!desc) {
    // Earth isn't a sky object in the from-Earth views -- you're standing on it. Only the
    // Solar System (orrery) view shows it as a body. Say so instead of a bare "not found".
    if (resolved.toLowerCase() === "earth" && (v === "2d" || v === "3d")) {
      toast("Earth is right under your feet in this view — switch to Solar System to see it as a planet.");
    } else {
      toast(`"${name}" not found`);
    }
    return;
  }
  view.setSelected(desc); showInfo(desc);
  const alt = view.lookAtSelected();
  // Below the horizon, the object is only HIDDEN when atmosphere is on (2D dome clips at the horizon;
  // 3D hides it behind the opaque ground). In Space view (atmosphere off) BOTH views render it past
  // the horizon -- it's already highlighted on screen, so don't nag. Only warn with atmosphere on.
  if (typeof alt === "number" && alt < 0 && state.get("atmosphere")) {
    const a = alt.toFixed(0);
    if (v === "2d") toast(`${desc.name || name} is below the horizon (alt ${a}°) — the dome only shows the sky above you. Turn on 🚀 Space view (or change the time) to see it.`);
    else if (v === "3d") toast(`${desc.name || name} is below the horizon (alt ${a}°) — turn on 🚀 Space view to see it through the ground.`);
  }
}

// Location/date-time sync with the popup (browser.storage.local). Guard re-entrancy so applying a
// remote change doesn't echo back out as our own write.
let applyingSync = false;
const SYNC_SRC = Math.random().toString(36).slice(2);   // tag our own writes so we can ignore the echo
// Push the current LOCATION to the popup. `label` is the place name (a city) or null = "use coords",
// which clears any stale city name the popup was showing for the previous location.
function pushLocation(label) {
  if (applyingSync) return;
  sync.setSync({ lat: state.get("lat"), lon: state.get("lon"), zone: state.get("tz"), label: label ?? null, _src: SYNC_SRC });
}
// Push the date/time only (preserve location + label).
function pushTime(wall) {   // "YYYY-MM-DDTHH:MM" or null = "now"
  if (applyingSync) return;
  sync.setSync({ wall, _src: SYNC_SRC });
}
// Seed on startup: share the current location WITHOUT touching the popup's label/wall.
function pushSeed() {
  if (applyingSync) return;
  sync.setSync({ lat: state.get("lat"), lon: state.get("lon"), zone: state.get("tz"), _src: SYNC_SRC });
}

// Apply a location chosen in the app: set lat/lon, resolve its timezone (so the panchang/clock are
// right and match what the popup will show), update the bar fields, and push it to the popup.
async function applyLocation(la, lo, city) {
  state.set("lat", la); state.set("lon", lo);
  controlBar.setLatLon(la, lo);
  let tz = city && city.tz;
  if (!tz) { try { tz = (await api.fetchTz(la, lo)).tz; } catch { /* keep current tz offline */ } }
  if (tz) state.set("tz", tz);
  const label = city ? `${city.name}${city.country ? ", " + city.country : ""}` : null;
  controlBar.setPlace(label);   // show the picked city (or clear to coords for a manual lat/lon)
  pushLocation(label);
  refetchCurrent();
}

export async function init() {
  loadSettings();                 // apply saved prefs (ayanamsa/node/language/...) before fetches
  const synced = await sync.getSync();   // location/date-time shared with the popup
  const fromSync = synced && synced.lat != null;
  const loc = fromSync
    ? { lat: synced.lat, lon: synced.lon, tz: synced.zone || synced.tz, label: synced.label }
    : await bootstrapLocation();
  state.set("lat", loc.lat);
  state.set("lon", loc.lon);
  state.set("tz", loc.tz);

  containers["3d"] = document.getElementById("sky-container");
  containers["2d"] = document.getElementById("dome-container");
  containers["orrery"] = document.getElementById("orrery-container");
  containers["panchang"] = document.getElementById("panchang-container");
  view3d = createView3D(containers["3d"]);
  view2d = createView2D(containers["2d"]);
  orreryView = createOrrery(containers["orrery"]);
  orreryLog = state.get("orreryScale") === "log";       // apply saved orrery scale default
  orreryView.setScaleMode(orreryLog ? "log" : "linear");
  panchangTab = createPanchangTab(document.getElementById("pj-today"));
  calendarView = createCalendar(document.getElementById("pj-month"), {
    fetchMonth: (y, m) => api.fetchMonth(y, m, state.get("lat"), state.get("lon"), state.get("tz"), state.get("ayanamsa")),
    onPickDay,
  });
  document.querySelectorAll(".pj-sub").forEach((b) => { b.onclick = () => showPanchangSub(b.dataset.sub); });
  containers["kundali"] = document.getElementById("kundali-container");
  kundaliView = createKundali(containers["kundali"]);
  controlBar = createControlBar(document.getElementById("control-bar-host"), {
    onLocation: (la, lo, city) => { applyLocation(la, lo, city); },
    onTime: () => { refetchCurrent(); pushTime(state.utcToWall(state.simTime(), state.get("tz"))); },
    onNow: () => { refetchCurrent(); pushTime(null); },
    onCast: castKundali,
  });
  // Apply a date/time the popup pinned, and keep both contexts in step while both are open.
  if (synced && synced.wall) { state.setWallTime(synced.wall); state.set("timeFlowRate", 0); controlBar.setDateTime(state.simTime()); }
  sync.onSyncChange((s) => {
    if (!s || applyingSync || s._src === SYNC_SRC) return;   // ignore our own writes
    applyingSync = true;
    try {
      const ntz = s.zone || s.tz;
      if (s.lat != null && (s.lat !== state.get("lat") || s.lon !== state.get("lon") || ntz !== state.get("tz"))) {
        state.set("lat", s.lat); state.set("lon", s.lon); if (ntz) state.set("tz", ntz);
        controlBar.setLatLon(s.lat, s.lon);
      }
      if (s.lat != null) controlBar.setPlace(s.label);   // reflect the popup's place name
      const inK = state.get("view") === "kundali";   // don't overwrite the Kundali BIRTH fields
      if (s.wall) { state.setWallTime(s.wall); state.set("timeFlowRate", 0); if (!inK) controlBar.setDateTime(state.simTime()); }
      else { state.resetToNow(); if (!inK) controlBar.setNow(); }
      refetchCurrent();
    } finally { applyingSync = false; }
  });
  controlBar.setPlace(loc.label);   // show the current place name (Ujjain / popup city / coords)
  // Seed the store so the popup adopts this. From sync -> preserve its label. From our bootstrap,
  // persist ONLY a real geo fix (with label); DON'T persist the Ujjain fallback, so geolocation is
  // retried on the next start until it succeeds.
  if (fromSync) pushSeed();
  else if (loc.source !== "fallback") pushLocation(loc.label || null);
  setupSavedMenu();                               // ★ Saved dropdown in the unified control bar (all views)
  sev.onEventsChange(() => renderSavedPanel());   // live-refresh markers + menu when events change
  renderSavedPanel();                             // initial saved-events panel + Today/Month markers + menu
  state.subscribe("timeFormat", () => { if (state.get("view") === "panchang") panchangTab.tick(state.simTime().getTime()); });

  const starsData = await api.fetchStars();
  view3d.setStars(starsData);
  view2d.setStars(starsData);
  orreryView.setStars(starsData);
  await refetchSky(true);

  // Overlays (Phase 7B): constellation lines + sidereal Rashi band.
  try {
    const [cons, ayan, messierData] = await Promise.all([
      api.fetchConstellations(),
      api.fetchAyanamsa(state.simTime(), state.get("ayanamsa")),
      api.fetchMessier(),
    ]);
    ayanamsaDeg = ayan.ayanamsa_deg;
    const od = {
      cons, starMap: overlays.buildStarMap(starsData),
      ayanamsaDeg, jd: astro.jdFromDate(state.simTime()),
      messier: overlays.messierVecs(messierData),
    };
    view3d.setOverlayData(od);
    view2d.setOverlayData(od);
    orreryView.setAries(ayanamsaDeg);
  } catch (err) {
    console.warn("overlays unavailable:", err.message);
  }

  createViewBar(document.getElementById("view-bar-host"), ["3d", "2d", "orrery", "panchang", "kundali"]);
  createOverlayBar(document.getElementById("overlay-bar-host"), [
    // Atmosphere toggle (Phase 7C): ON = refracted ground view (default), OFF = geometric
    // space view. Visual only -- never affects the Panchang/Kundali/rise-set/kalam.
    { label: "🚀 Space view", views: ["3d", "2d"], get: () => !state.get("atmosphere"), set: (v) => state.set("atmosphere", !v) },
    { label: "Stars", views: ["3d", "2d", "orrery"], get: () => overlayState.stars, set: (v) => setOverlay("stars", v) },
    { label: "Constellations", views: ["3d", "2d"], get: () => overlayState.constellations, set: (v) => setOverlay("constellations", v) },
    { label: "Rashi band", views: ["3d", "2d", "orrery"], get: () => overlayState.rashi, set: (v) => setOverlay("rashi", v) },
    { label: "Messier", views: ["3d", "2d"], get: () => overlayState.messier, set: (v) => setOverlay("messier", v) },
    { label: "Milky Way", views: ["3d"], get: () => overlayState.milkyway, set: (v) => setOverlay("milkyway", v) },
    { label: "Grid", views: ["3d", "2d"], get: () => overlayState.grid, set: (v) => setOverlay("grid", v) },
    // Orrery-only controls.
    { label: "Log scale", views: ["orrery"], get: () => orreryLog, set: (v) => { orreryLog = v; orreryView.setScaleMode(v ? "log" : "linear"); } },
    { label: "Deep time", views: ["3d", "2d", "orrery"], get: () => deepTimeOn, set: setDeepTime },
  ]);

  // Settings panel (Phase 9D.1): persists ayanamsa/node/language/telescopic/scale prefs.
  createSettingsPanel({
    onChange: (field) => {
      if (field === "orreryScale" || field === "*") {
        orreryLog = state.get("orreryScale") === "log";
        orreryView.setScaleMode(orreryLog ? "log" : "linear");
      }
      if (field === "language" || field === "*") applyLanguage(state.get("language"));
      if (field === "nameMode" || field === "*") { i18n.setNameMode(state.get("nameMode")); relabelObjects(); }
      if (["ayanamsa", "telescopic", "*"].includes(field)) { refetchSky(true); refetchCurrent(); }
      if (field === "node" && state.get("view") === "kundali") castKundali();
    },
    onExport: () => { const v = state.get("view"); if (v === "3d" || v === "2d" || v === "orrery") exportView(viewObj(v), exportLabel()); },
    onPrint: () => window.print(),
  });

  initInfoPanel(onSelectName, clearActiveSelection);
  setupPicking();
  const names = [
    ...starsData.stars.filter((s) => s[4]).map((s) => s[4]),
    ...(sky ? sky.bodies.map((b) => b.name) : []),
    ...i18n.hinduNames(),                          // Surya/Chandra/Chitra... typeable in search
  ];
  setSearchNames([...new Set(names)].sort());

  const onLoc = async () => {
    // Resolving the tz re-anchors the sim clock automatically (state.set("tz") -> reanchorTime),
    // so a set wall time keeps its local reading at the new place. Then refetch off the synced
    // clock. (A wall time means "this wall clock here", not a frozen UTC instant.)
    try { state.set("tz", (await api.fetchTz(state.get("lat"), state.get("lon"))).tz); } catch { /* keep */ }
    refetchSky(true);
    if (state.get("view") === "panchang") refetchPanchang(true);
    if (state.get("view") === "kundali") castKundali();   // re-cast with the resolved tz
  };
  state.subscribe("lat", onLoc);
  state.subscribe("lon", onLoc);
  state.subscribe("view", applyView);
  state.subscribe("view", syncDeepTimeView);
  setupDeepTime();
  state.subscribe("view", () => requestAnimationFrame(layoutBars));   // bar heights change per view
  window.addEventListener("resize", () => requestAnimationFrame(layoutBars));
  setupBarsHandle();
  requestAnimationFrame(layoutBars);
  setHint(state.get("view"));
  window.addEventListener("keydown", onKey);

  // Invariant: Language only applies in Hindu mode. Self-correct a saved English+Indian combo
  // so reloads don't show localized keywords under a greyed-out (and so English) Language picker.
  if (state.get("nameMode") === "english") state.set("language", "en");
  await i18n.loadLang(state.get("language"));   // preload saved language bundle + relabel chrome
  relabelStatic();
  i18n.setNameMode(state.get("nameMode"));      // apply saved English/Hindu object-name mode
  relabelObjects();
  registerPWA();

  lastFrame = performance.now();
  requestAnimationFrame(loop);

  if (new URLSearchParams(location.search).has("debug")) await debugPolaris();
}

// Acceptance sanity check (Section 5 / Phase 5): Polaris sits at alt ~= observer latitude.
export async function debugPolaris() {
  const lat = state.get("lat"), lon = state.get("lon");
  const when = state.simTime();
  const [stars, sky] = await Promise.all([api.fetchStars(), api.fetchSky(lat, lon, when)]);
  const polaris = stars.stars.find((s) => s[0] === 11767);   // [hip, ra, dec, mag, name]
  const { ra, dec } = astro.precessRaDec(polaris[1], polaris[2], astro.jdFromDate(when));
  const { alt } = astro.eqToHorizontal(ra, dec, sky.lst_hours, lat);
  console.info(`Polaris alt=${alt.toFixed(2)} deg vs latitude=${lat.toFixed(2)} deg`);
  return alt;
}

if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", init);
}
