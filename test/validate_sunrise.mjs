import * as swe from "../src/sweph.js";
await swe.init();
const lat = 17.385, lon = 78.486, tzOffH = 5.5;       // Asia/Kolkata
const jd0 = swe.julday(2026, 6, 14, 18.5);            // local midnight 2026-06-15 IST in UT
const localHMS = (jd) => new Date((jd - 2440587.5) * 86400000 + tzOffH * 3600000).toISOString().substr(11, 8);
const rise = swe.nextRise(jd0, lon, lat, 0, true), set = swe.nextRise(jd0, lon, lat, 0, false);
const dS = (hms, ref) => {
  const p = (s) => s.split(":").reduce((a, v) => a * 60 + +v, 0);
  return Math.abs(p(hms) - p(ref));
};
const gotR = localHMS(rise), gotS = localHMS(set);
const dr = dS(gotR, "05:41:37"), ds = dS(gotS, "18:51:26");
console.log(`sunrise ${gotR}  ref 05:41:37  Δ=${dr}s  ${dr <= 3 ? "OK" : "FAIL"}`);
console.log(`sunset  ${gotS}  ref 18:51:26  Δ=${ds}s  ${ds <= 3 ? "OK" : "FAIL"}`);
process.exit(dr <= 3 && ds <= 3 ? 0 : 1);
