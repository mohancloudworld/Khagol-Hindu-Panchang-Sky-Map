// Daily reminders (Android app only): compute the next ~12 months of festival / saved-tithi / grahana
// dates with the app's own engine and hand them to the native scheduler, which fires a daily
// notification for anything landing on the device's date — fully offline. Preferences live in
// localStorage; the plan is recomputed (and re-pushed) on every app start and settings change,
// so it can only go stale if the app isn't opened for a year.
//
// `lead` is the notice period in DAYS: each event is planned on (its date − lead) so the
// notification says "Deepavali — in 3 days", not "today" (which is too late to prepare for).
// The native side needs nothing new for this: it still just fires whatever is dated today.
import * as api from "./api.js";
import * as sev from "../src/savedevents.js";

const KEY = "notifyPrefs";
export const available = () => !!globalThis.KhagolAndroid?.setNotifications;

export function getPrefs() {
  const d = { enabled: false, fest: true, saved: true, ecl: true, eclVisibleOnly: false, hour: 7, lead: 3 };
  try { return { ...d, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
  catch { return d; }
}
export function setPrefs(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* quota */ }
}

// "YYYY-MM-DD" shifted by `days` (calendar arithmetic, zone-free).
export const shiftYmd = (ymd, days) => {
  if (!days) return ymd;
  const d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10) + days));
  return d.toISOString().slice(0, 10);
};
const leadWord = (n) => (n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);
// Short human date for the detail line: "Sun 8 Nov".
const shortDate = (ymd) => new Date(`${ymd}T00:00:00Z`)
  .toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

// Next 12 months (starting this month) of [{date, title, detail}] for the given location, each
// event planned `lead` days early. A 13th month is scanned so events just past the horizon
// still get their early notice.
async function computePlan({ fest, saved, ecl, eclVisibleOnly, lead = 0, lat, lon, tz, ayanamsa }) {
  const now = new Date();
  const plan = [];
  const savedEvents = saved ? await sev.listEvents() : [];
  // One event -> one plan entry, dated `lead` days before it; the title says how far off it is.
  const add = (date, title, detail) => plan.push({
    date: shiftYmd(date, -lead),
    title: lead ? `${title} — ${leadWord(lead)}` : title,
    detail: lead ? `${shortDate(date)} · ${detail}` : detail,
  });
  for (let i = 0; i < 13; i++) {
    const y = now.getFullYear() + Math.floor((now.getMonth() + i) / 12);
    const m = ((now.getMonth() + i) % 12) + 1;
    const days = await api.fetchMonth(y, m, lat, lon, tz, ayanamsa);
    for (const day of days) {
      if (fest) {
        for (const f of day.festivals || []) {
          add(day.date, f.name, `${day.masa} ${day.paksha} ${day.tithi_at_sunrise} · Khagol`);
        }
      }
      // Grahana fires on the eclipse's own local date like the rest; the detail line carries
      // the window and whether it is actually above the horizon here, since an eclipse that
      // misses your longitude is still a real event on the calendar.
      if (ecl) {
        for (const g of day.grahana || []) {
          // visible_here is computed for the lat/lon this plan was built with, so the filter
          // follows the location automatically — provided the plan is resynced when it changes
          // (main.js subscribes to lat/lon/tz for exactly that).
          if (eclVisibleOnly && g.visible_here === false) continue;
          const clock = (s2) => (s2 ? s2.slice(11, 16) : "—");
          const win = g.kind === "lunar"
            ? `${clock(g.partial_begin_local || g.penumbral_begin_local)}–${clock(g.partial_end_local || g.penumbral_end_local)}`
            : `${clock((g.local && g.local.first_contact_local) || g.begin_local)}–${clock((g.local && g.local.fourth_contact_local) || g.end_local)}`;
          add(day.date, `${g.kind === "lunar" ? "☾" : "☉"} ${g.grahana} — ${g.type}`,
            `${win}${g.visible_here === false ? " · not visible here" : ""} · Khagol`);
        }
      }
      if (saved && savedEvents.length) {
        for (const e of sev.matchDay(day.masa, day.tithi_n, savedEvents)) {
          add(day.date, `★ ${e.label}`, `${e.masa} ${e.paksha} ${e.tithi_name} · Khagol`);
        }
      }
    }
  }
  return plan;
}

// Recompute + push the plan to the native scheduler per current prefs. Called on app start
// (when enabled) and whenever the user changes the reminder settings.
export async function syncNotifications(loc) {
  if (!available()) return { pushed: false };
  const p = getPrefs();
  if (!p.enabled) {
    globalThis.KhagolAndroid.setNotifications("[]", p.hour, false);
    return { pushed: true, n: 0 };
  }
  const plan = await computePlan({ fest: p.fest, saved: p.saved, ecl: p.ecl,
    eclVisibleOnly: p.eclVisibleOnly, lead: Math.max(0, Math.min(30, +p.lead || 0)),
    ...loc, ayanamsa: loc.ayanamsa });
  globalThis.KhagolAndroid.setNotifications(JSON.stringify(plan), p.hour, true);
  return { pushed: true, n: plan.length };
}

// --- Wake alarms (sunrise / brahma muhurta, daily-changing times) -----------------------------
// The engine's month scan already carries each day's sunrise; brahma muhurta starts 96 min
// before it. The native side chains ONE exact alarm (setAlarmClock) per upcoming entry, so the
// ring time tracks the daily drift; the 45-day horizon refreshes on every app open.
const WKEY = "wakePrefs";
export const wakeAvailable = () => !!globalThis.KhagolAndroid?.setWakeAlarms;

export function getWakePrefs() {
  try { return { enabled: false, sunrise: true, brahma: false, offset: 15, ...JSON.parse(localStorage.getItem(WKEY) || "{}") }; }
  catch { return { enabled: false, sunrise: true, brahma: false, offset: 15 }; }
}
export function setWakePrefs(p) {
  try { localStorage.setItem(WKEY, JSON.stringify(p)); } catch { /* quota */ }
}

// "HH:MM[:SS]" minus `min` minutes -> [dayShift, "HH:MM"] (dayShift -1 when it crosses midnight).
function minusMin(hms, min) {
  const m = String(hms || "").match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  let t = +m[1] * 60 + +m[2] - min;
  let shift = 0;
  while (t < 0) { t += 1440; shift -= 1; }
  return [shift, `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`];
}
const shiftDate = shiftYmd;

// Next ~45 days of ring instants [{at:"YYYY-MM-DDTHH:MM", title}] for the enabled kinds.
async function computeWakePlan({ sunrise, brahma, offset, lat, lon, tz, ayanamsa }) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const plan = [];
  for (let i = 0; i < 3; i++) {   // 3 calendar months ≈ a 45+ day horizon after filtering
    const y = now.getFullYear() + Math.floor((now.getMonth() + i) / 12);
    const m = ((now.getMonth() + i) % 12) + 1;
    const days = await api.fetchMonth(y, m, lat, lon, tz, ayanamsa);
    for (const day of days) {
      if (day.date < today || !day.sunrise) continue;
      const off = `${offset ? ` (${offset} min before)` : ""}`;
      if (sunrise) {
        const r = minusMin(day.sunrise, offset);
        if (r) plan.push({ at: `${shiftDate(day.date, r[0])}T${r[1]}`, title: `Sunrise${off} — Khagol` });
      }
      if (brahma) {
        const r = minusMin(day.sunrise, 96 + offset);
        if (r) plan.push({ at: `${shiftDate(day.date, r[0])}T${r[1]}`, title: `Brahma muhurta${off} — Khagol` });
      }
    }
  }
  plan.sort((a, b) => (a.at < b.at ? -1 : 1));
  return plan.slice(0, 120);
}

export async function syncWakeAlarms(loc) {
  if (!wakeAvailable()) return { pushed: false };
  const p = getWakePrefs();
  if (!p.enabled || (!p.sunrise && !p.brahma)) {
    globalThis.KhagolAndroid.setWakeAlarms("[]", false);
    return { pushed: true, n: 0 };
  }
  const plan = await computeWakePlan({ ...p, ...loc });
  globalThis.KhagolAndroid.setWakeAlarms(JSON.stringify(plan), true);
  // First entry still ahead of the device clock = what the native side will arm next.
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const nowIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const next = plan.find((e) => e.at > nowIso) || null;
  return { pushed: true, n: plan.length, next };
}
