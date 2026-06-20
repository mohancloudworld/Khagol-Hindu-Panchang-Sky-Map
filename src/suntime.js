// Rise/set + governing-sunrise helpers. DST-aware via an IANA
// `zone` name (tz.js). Dates are JS Date (UTC instants); ymd = {y,mo,d}.
import * as swe from "./sweph.js";
import { jdToDate, localMidnightJd, ymdOfInstant, addDays } from "./tz.js";
export { jdToDate, dateToJd, ymdOfInstant, addDays, cmpYMD, isoYMD, localMidnightJd, clockHMS, offsetHours } from "./tz.js";

// (rise, set) Dates for `body` over the local civil day [00:00, +24h) in `zone`; either may be null.
export function riseSetOn(lat, lon, ymd, zone, body = "sun") {
  const t0 = localMidnightJd(ymd, zone), t1 = localMidnightJd(addDays(ymd, 1), zone);
  const rj = swe.nextRise(t0, lon, lat, 0, true, body);
  const sj = swe.nextRise(t0, lon, lat, 0, false, body);
  return [rj >= t0 && rj < t1 ? jdToDate(rj) : null, sj >= t0 && sj < t1 ? jdToDate(sj) : null];
}
export const sunriseOn = (lat, lon, ymd, zone) => riseSetOn(lat, lon, ymd, zone, "sun")[0];

// The solar day containing `instant`: {gov, next, isPreDawn} (sunrise.py governing_sunrise).
export function governingSunrise(lat, lon, instant, zone) {
  const ld = ymdOfInstant(instant, zone);
  const today = sunriseOn(lat, lon, ld, zone);
  if (today && instant >= today) return { gov: today, next: sunriseOn(lat, lon, addDays(ld, 1), zone), isPreDawn: false };
  return { gov: sunriseOn(lat, lon, addDays(ld, -1), zone), next: today, isPreDawn: true };
}
