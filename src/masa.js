// Amanta masa + adhika detection + samvatsara.
// Lunar month bounded by two new moons; the Sun's rashi at each names the month / reveals adhika.
import * as swe from "./sweph.js";
import { tithi } from "./panchang.js";
import { MASA, SAMVATSARA } from "./names.js";
import { jdToDate, localMidnightJd, ymdOfInstant, addDays, cmpYMD, isoYMD } from "./tz.js";

const SECOND_JD = 1 / 86400;
const norm360 = (x) => ((x % 360) + 360) % 360;
const elong = (jd, ay) => norm360(swe.sunMoonLon(jd, ay)[1] - swe.sunMoonLon(jd, ay)[0]);
const g = (jd, ay) => norm360(elong(jd, ay) + 180) - 180;   // signed distance to conjunction

function bisectNm(lo, hi, ay) {
  for (let i = 0; i < 60; i++) { const mid = 0.5 * (lo + hi); if (g(mid, ay) < 0) lo = mid; else hi = mid; if (hi - lo < SECOND_JD) break; }
  return hi;
}
export function findPrevNewMoon(jd, ay = "lahiri") {
  let j = jd, e = elong(jd, ay);
  for (let i = 0; i < 40; i++) { const j2 = j - 1, e2 = elong(j2, ay); if (e2 > e) return bisectNm(j2, j, ay); j = j2; e = e2; }
  throw new Error("previous new moon not found");
}
export function findNextNewMoon(jd, ay = "lahiri") {
  let j = jd, e = elong(jd, ay);
  for (let i = 0; i < 40; i++) { const j2 = j + 1, e2 = elong(j2, ay); if (e2 < e) return bisectNm(j, j2, ay); j = j2; e = e2; }
  throw new Error("next new moon not found");
}
const sunRashi = (jd, ay) => Math.floor(swe.longitude(jd, "sun", ay) / 30);

export function amantaMasa(jdSunrise, ay = "lahiri") {
  const nmPrev = findPrevNewMoon(jdSunrise, ay);
  const nmNext = findNextNewMoon(nmPrev + 1, ay);
  const r1 = sunRashi(nmPrev, ay), r2 = sunRashi(nmNext, ay);
  const base = MASA[(r1 + 1) % 12];
  const isAdhika = r1 === r2;
  return { name: isAdhika ? `Adhika ${base}` : base, is_adhika: isAdhika, is_kshaya: r2 === (r1 + 2) % 12, amanta: true };
}

// --- Ugadi + samvatsara (DST-aware via IANA zone) ------------------------------------------
function firstSunriseAfter(nmJd, lat, lon, zone) {
  let cur = ymdOfInstant(jdToDate(nmJd), zone);
  for (let i = 0; i < 3; i++) {
    const sr = swe.nextRise(localMidnightJd(cur, zone), lon, lat, 0, true);
    if (sr > nmJd) return sr;
    cur = addDays(cur, 1);
  }
  throw new Error("no sunrise after new moon");
}

export function findUgadi(year, lat, lon, zone, ay = "lahiri") {
  let nm = findNextNewMoon(swe.julday(year, 2, 15, 0), ay);
  for (let i = 0; i < 4; i++) {
    const nmNext = findNextNewMoon(nm + 1, ay);
    const r1 = sunRashi(nm, ay);
    const isAdhika = r1 === sunRashi(nmNext, ay);
    if ((r1 + 1) % 12 === 0 && !isAdhika) {            // starts a regular (non-adhika) Chaitra
      const srJd = firstSunriseAfter(nm, lat, lon, zone);
      let ud = ymdOfInstant(jdToDate(srJd), zone);
      if (tithi(srJd, ay).number !== 1) ud = addDays(ud, -1);   // Pratipada kshaya -> day it begins
      return ud;
    }
    nm = nmNext;
  }
  throw new Error(`Ugadi not found for ${year}`);
}

export function samvatsara(localYMD, lat, lon, zone, ay = "lahiri") {
  const ug = findUgadi(localYMD.y, lat, lon, zone, ay);
  const saka = cmpYMD(localYMD) >= cmpYMD(ug) ? localYMD.y - 78 : localYMD.y - 79;
  const number = ((saka + 11) % 60) + 1;
  return { number, name: SAMVATSARA[number - 1], saka, ugadi: isoYMD(ug) };
}
