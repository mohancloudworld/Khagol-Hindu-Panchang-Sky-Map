// Festivals by kaal-based determination.
// Find the absolute time-band of a festival's target tithi inside the right lunar month,
// then pick the civil day by the rule's kaal (udaya / interval / chandrodaya).
import * as swe from "./sweph.js";
import { amantaMasa, findNextNewMoon } from "./masa.js";
import { ritualKaals } from "./daywindows.js";
import * as st from "./suntime.js";
import { RASHI } from "./names.js";

const SECOND_JD = 1 / 86400;
const norm360 = (x) => ((x % 360) + 360) % 360;

export const FESTIVAL_RULES = [
  { name: "Ugadi", masa: "Chaitra", paksha: "Shukla", tithi: 1, kaal: "udaya" },
  { name: "Rama Navami", masa: "Chaitra", paksha: "Shukla", tithi: 9, kaal: "madhyahna" },
  { name: "Akshaya Tritiya", masa: "Vaishakha", paksha: "Shukla", tithi: 3, kaal: "udaya" },
  { name: "Guru Purnima", masa: "Ashadha", paksha: "Shukla", tithi: 15, kaal: "udaya" },
  { name: "Krishna Janmashtami", masa: "Shravana", paksha: "Krishna", tithi: 8, kaal: "nishita", split: "smarta/vaishnava" },
  { name: "Vinayaka Chaturthi", masa: "Bhadrapada", paksha: "Shukla", tithi: 4, kaal: "madhyahna" },
  { name: "Sharad Navaratri begins", masa: "Ashwina", paksha: "Shukla", tithi: 1, kaal: "udaya" },
  { name: "Vijayadashami", masa: "Ashwina", paksha: "Shukla", tithi: 10, kaal: "aparahna" },
  { name: "Naraka Chaturdashi", masa: "Ashwina", paksha: "Krishna", tithi: 14, kaal: "udaya", note: "classical rule is moonrise-with-Chaturdashi; simplified to udaya" },
  { name: "Deepavali", masa: "Ashwina", paksha: "Krishna", tithi: 15, kaal: "pradosha" },
  { name: "Karwa Chauth", masa: "Ashwina", paksha: "Krishna", tithi: 4, kaal: "chandrodaya", note: "North-Indian Purnimanta 'Kartika K4' = Amanta Ashwina" },
  { name: "Karthika Purnima", masa: "Kartika", paksha: "Shukla", tithi: 15, kaal: "udaya" },
  { name: "Vaikuntha Ekadashi", masa: "Margashirsha", paksha: "Shukla", tithi: 11, kaal: "udaya" },
  { name: "Maha Shivaratri", masa: "Magha", paksha: "Krishna", tithi: 14, kaal: "nishita" },
  { name: "Holika Dahan", masa: "Phalguna", paksha: "Shukla", tithi: 15, kaal: "pradosha" },
];

export const globalTithi = (paksha, n) => (paksha === "Shukla" ? n : 15 + n);

const elong = (jd, ay) => norm360(swe.sunMoonLon(jd, ay)[1] - swe.sunMoonLon(jd, ay)[0]);
function crossing(lo, hi, target, ay) {
  for (let i = 0; i < 60; i++) { const mid = 0.5 * (lo + hi); if (elong(mid, ay) < target) lo = mid; else hi = mid; if (hi - lo < SECOND_JD) break; }
  return hi;
}
function findMonth(masaName, year, ay) {
  let nm = findNextNewMoon(swe.julday(year, 1, 1, 0), ay);
  for (let i = 0; i < 14; i++) {
    const nmNext = findNextNewMoon(nm + 1, ay);
    if (amantaMasa(nm + 0.5, ay).name === masaName) return [nm, nmNext];
    nm = nmNext;
  }
  throw new Error(`lunar month ${masaName} not found in ${year}`);
}
function tithiBand([nmStart, nmEnd], gt, ay) {
  const eps = 60 * SECOND_JD;
  const tb = gt === 1 ? nmStart : crossing(nmStart + eps, nmEnd - eps, (gt - 1) * 12, ay);
  const te = gt === 30 ? nmEnd : crossing(nmStart + eps, nmEnd - eps, gt * 12, ay);
  return [st.jdToDate(tb), st.jdToDate(te)];
}

const overlapS = (a0, a1, b0, b1) => Math.max(0, (Math.min(+a1, +b1) - Math.max(+a0, +b0)) / 1000);

function udayaDay(tb, te, lat, lon, zone) {
  let d = st.addDays(st.ymdOfInstant(tb, zone), -1);
  for (let i = 0; i < 3; i++) {
    const sr = st.sunriseOn(lat, lon, d, zone);
    if (sr && tb <= sr && sr < te) return d;
    d = st.addDays(d, 1);
  }
  return st.ymdOfInstant(st.governingSunrise(lat, lon, tb, zone).gov, zone);   // kshaya
}
function chandrodayaDay(tb, te, lat, lon, zone) {
  let d = st.addDays(st.ymdOfInstant(tb, zone), -1);
  for (let i = 0; i < 3; i++) {
    const mr = st.riseSetOn(lat, lon, d, zone, "moon")[0];
    if (mr && tb <= mr && mr < te) return [d, mr];
    d = st.addDays(d, 1);
  }
  return [null, null];
}
function intervalDay(kaal, tb, te, lat, lon, zone) {
  let best = null, bestOv = 0, bestWin = null, d = st.addDays(st.ymdOfInstant(tb, zone), -1);
  for (let i = 0; i < 4; i++) {
    const [sr, ss] = st.riseSetOn(lat, lon, d, zone);
    const nsr = st.sunriseOn(lat, lon, st.addDays(d, 1), zone);
    if (sr && ss && nsr) {
      const win = ritualKaals(sr, ss, nsr)[kaal];
      const ov = overlapS(win.start, win.end, tb, te);
      if (ov > bestOv) { best = d; bestOv = ov; bestWin = win; }
    }
    d = st.addDays(d, 1);
  }
  return [best, bestWin];
}

export function determineFestival(rule, year, lat, lon, zone, ay = "lahiri") {
  const gt = globalTithi(rule.paksha, rule.tithi);
  const [tb, te] = tithiBand(findMonth(rule.masa, year, ay), gt, ay);
  let d, window;
  if (rule.kaal === "udaya") { d = udayaDay(tb, te, lat, lon, zone); window = { start: tb, end: te }; }
  else if (rule.kaal === "chandrodaya") { const [dd, mr] = chandrodayaDay(tb, te, lat, lon, zone); d = dd; window = mr ? { start: mr, end: mr } : null; }
  else { const [dd, win] = intervalDay(rule.kaal, tb, te, lat, lon, zone); d = dd; window = win; }
  if (!d) return null;

  let note = rule.note ?? null, disputed = false;
  if (rule.split) {
    const ud = udayaDay(tb, te, lat, lon, zone);
    if (st.cmpYMD(ud) !== st.cmpYMD(d)) {
      disputed = true;
      const alt = `${rule.split} variation: udaya observance falls on ${st.isoYMD(ud)}`;
      note = note ? `${note}; ${alt}` : alt;
    }
  }
  return { name: rule.name, date: st.isoYMD(d), kaal: rule.kaal, window, disputed, note };
}

export function festivalsInYear(year, lat, lon, zone, ay = "lahiri") {
  const out = [];
  for (const rule of FESTIVAL_RULES) {
    try { const f = determineFestival(rule, year, lat, lon, zone, ay); if (f) out.push(f); } catch { /* skip */ }
  }
  return out;
}

export function sankrantiRashi(prevSunriseJd, sunriseJd, ay = "lahiri") {
  const rp = Math.floor(swe.longitude(prevSunriseJd, "sun", ay) / 30);
  const rn = Math.floor(swe.longitude(sunriseJd, "sun", ay) / 30);
  return rn !== rp ? RASHI[rn] : null;
}
