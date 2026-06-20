// The five angas.
// Each anga's end-instant is found by bisecting its sidereal angle to the next arc boundary.
import * as swe from "./sweph.js";
import { TITHI, NAKSHATRA, YOGA, VARA, VARA_ENGLISH, karanaName } from "./names.js";

const NAK_ARC = 360 / 27;        // 13°20'
const PADA_ARC = NAK_ARC / 4;    // 3°20'
const SECOND_JD = 1 / 86400;
const mod360 = (x) => ((x % 360) + 360) % 360;

// JD at which angleFunc next reaches a multiple of arcDeg after jd (matches elements.py).
function boundaryJd(jd, angleFunc, arcDeg, horizonH = 30) {
  const base = angleFunc(jd);
  let offset = arcDeg - (base % arcDeg);
  if (offset < 1e-9) offset = arcDeg;
  const delta = (j) => mod360(angleFunc(j) - base);
  let lo = jd, hi = jd + horizonH / 24;
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    if (delta(mid) < offset) lo = mid; else hi = mid;
    if (hi - lo < SECOND_JD) break;
  }
  return hi;
}

const tithiAngle = (ay) => (j) => { const [s, m] = swe.sunMoonLon(j, ay); return mod360(m - s); };
const moonAngle = (ay) => (j) => swe.sunMoonLon(j, ay)[1];
const yogaAngle = (ay) => (j) => { const [s, m] = swe.sunMoonLon(j, ay); return mod360(s + m); };

export function tithi(jd, ay = "lahiri") {
  const [s, m] = swe.sunMoonLon(jd, ay);
  const elong = mod360(m - s);
  const n = Math.floor(elong / 12) + 1;            // 1..30
  const paksha = n <= 15 ? "Shukla" : "Krishna";
  const name = TITHI[n - 1];
  return { number: n, name, paksha, display: `${paksha} ${name}`, ends_at_jd: boundaryJd(jd, tithiAngle(ay), 12) };
}

export function nakshatra(jd, ay = "lahiri") {
  const m = swe.sunMoonLon(jd, ay)[1];
  const n = Math.floor(m / NAK_ARC) + 1;           // 1..27
  const pada = Math.floor((m % NAK_ARC) / PADA_ARC) + 1;
  return { number: n, name: NAKSHATRA[n - 1], pada, ends_at_jd: boundaryJd(jd, moonAngle(ay), NAK_ARC) };
}

export function yoga(jd, ay = "lahiri") {
  const [s, m] = swe.sunMoonLon(jd, ay);
  const n = Math.floor(mod360(s + m) / NAK_ARC) + 1; // 1..27
  return { number: n, name: YOGA[n - 1], ends_at_jd: boundaryJd(jd, yogaAngle(ay), NAK_ARC) };
}

export function karana(jd, ay = "lahiri") {
  const [s, m] = swe.sunMoonLon(jd, ay);
  const k = Math.floor(mod360(m - s) / 6);         // 0..59
  return { index: k, name: karanaName(k), ends_at_jd: boundaryJd(jd, tithiAngle(ay), 6) };
}

// Vara from a local civil weekday (0=Sunday..6=Saturday, e.g. Date.getDay() in the local tz).
export function varaForWeekday(sundayBasedDay) {
  return { index: sundayBasedDay, name: VARA[sundayBasedDay], english: VARA_ENGLISH[sundayBasedDay] };
}
