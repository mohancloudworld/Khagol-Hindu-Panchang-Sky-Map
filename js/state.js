// state.js -- plain observable app state (Section 5.1). No framework.
//
// Time model -- ONE source of truth. The user's intent is a wall-clock string in the
// observer's timezone (`timeAnchorWall`, null = live "now"); the absolute instant is always
// DERIVED from (anchor, tz) through wallToUtc(). Because the instant is derived, a timezone
// change (e.g. picking a different city) re-anchors the clock automatically via set("tz"),
// so the sky/orrery/panchang clock can never disagree with the Kundali about what a given
// wall time means. Runtime: simTime = realNow + timeOffsetMs (or pinnedTime if pinned);
// timeOffsetMs is the DERIVED jump+drift, recomputed by reanchorTime(); timeFlowRate
// multiplies the passage of time for time-lapse.

// DE440s validity span (Section 5.1) -- simTime is clamped to it.
export const EPHEMERIS_MIN = Date.UTC(1849, 0, 1);
export const EPHEMERIS_MAX = Date.UTC(2149, 11, 31, 23, 59, 59);

const state = {
  lat: 23.1765,
  lon: 75.7885,
  tz: "Asia/Kolkata",
  timeAnchorWall: null,   // "YYYY-MM-DDTHH:MM" wall clock (source of truth), or null = live now
  timeOffsetMs: 0,        // DERIVED: offset of sim clock from real now (set by reanchorTime)
  pinnedTime: null,       // Date, or null to track the live clock
  timeFlowRate: 1,        // 0 = paused, 1 = real-time, others = time-lapse
  view: "3d",             // '3d' | '2d' | 'orrery' | 'panchang' | 'kundali'
  atmosphere: true,
  ayanamsa: "lahiri",
  node: "mean",            // Kundali node: 'mean' | 'true' (Section 9B.1)
  telescopic: true,        // show Uranus/Neptune (Section 7.3)
  orreryScale: "linear",   // orrery default scale: 'linear' | 'log' (Section 7D.2)
  language: "en",
  timeFormat: (typeof localStorage !== "undefined" && localStorage.getItem("timeFormat")) || "24h",
  selectedObject: null,
  overlays: { constellations: false, rashi: false, milkyway: false, messier: false },
  skyData: null,          // last /api/sky response
  stars: null,            // cached /api/stars
  panchang: null,         // last /api/panchang response
};

const subs = new Map();   // key -> Set<cb>

export function get(key) {
  return state[key];
}

export function getState() {
  return state;
}

export function set(key, value) {
  if (state[key] === value) return;
  state[key] = value;
  // The wall anchor is interpreted in the observer tz, so any tz change must re-derive the
  // clock (this is the structural guarantee that the sky clock follows the location's tz).
  if (key === "tz") reanchorTime();
  const cbs = subs.get(key);
  if (cbs) for (const cb of cbs) cb(value, key);
}

export function subscribe(key, cb) {
  if (!subs.has(key)) subs.set(key, new Set());
  subs.get(key).add(cb);
  return () => subs.get(key).delete(cb);
}

// Clamp a millisecond timestamp to the ephemeris span.
export function clampToEphemeris(ms) {
  return Math.max(EPHEMERIS_MIN, Math.min(EPHEMERIS_MAX, ms));
}

// Current simulation time as a Date (clamped).
export function simTime() {
  const ms = state.pinnedTime
    ? state.pinnedTime.getTime()
    : Date.now() + state.timeOffsetMs;
  return new Date(clampToEphemeris(ms));
}

// True when sim time is "at rest" -- drives the Panchang freeze rule (Section 5.4).
export function timeAtRest() {
  return (state.timeFlowRate === 0 || state.timeFlowRate === 1) && state.view !== "orrery";
}

// Pin an explicit instant (manual date entry); pauses live tracking. A pin is its own
// absolute instant (e.g. month-grid noon), so it supersedes any wall anchor.
export function pinTime(date) {
  state.timeAnchorWall = null;
  state.pinnedTime = date ? new Date(clampToEphemeris(date.getTime())) : null;
}

// Reset to live "now".
export function resetToNow() {
  state.timeAnchorWall = null;
  state.pinnedTime = null;
  state.timeOffsetMs = 0;
  set("timeFlowRate", 1);
}

// --- timezone-aware datetime helpers (the location's wall clock <-> UTC instant) -----------
// These are pure (Intl only) and live here so the time invariant is owned in one module.
// Offset (ms) of an IANA zone at a given instant, computed via Intl (handles DST + history).
function tzOffsetMs(tz, date) {
  try {
    const p = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(date);
    const m = {}; for (const x of p) m[x.type] = x.value;
    return Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour, +m.minute, +m.second) - date.getTime();
  } catch { return 0; }   // non-IANA (ocean/fixed) -> treat as UTC
}
// "YYYY-MM-DDTHH:MM" wall clock in `tz` -> UTC Date (iterated once for DST edges).
export function wallToUtc(wall, tz) {
  const naive = Date.parse(wall + ":00Z");
  let off = tzOffsetMs(tz, new Date(naive));
  off = tzOffsetMs(tz, new Date(naive - off));
  return new Date(naive - off);
}
// UTC Date -> "YYYY-MM-DDTHH:MM" wall clock in `tz` (for the datetime input).
export function utcToWall(date, tz) {
  return new Date(date.getTime() + tzOffsetMs(tz, date)).toISOString().slice(0, 16);
}

// Set the wall-clock anchor (the user's entered local time), or null for live "now", then
// re-derive the clock. This is the ONLY way the bar should set an explicit time.
export function setWallTime(wall) {
  state.timeAnchorWall = wall || null;
  if (!state.timeAnchorWall) { state.timeOffsetMs = 0; state.pinnedTime = null; return; }
  reanchorTime();
}

// Re-derive timeOffsetMs from the wall anchor under the CURRENT tz ("jump, keep flowing":
// pinnedTime cleared so time-lapse still advances from the anchor). No-op when live or pinned
// without an anchor. Called on every tz change so the location's wall reading is preserved.
export function reanchorTime() {
  if (!state.timeAnchorWall) return;
  const inst = wallToUtc(state.timeAnchorWall, state.tz);
  state.timeOffsetMs = inst.getTime() - Date.now();
  state.pinnedTime = null;
}
