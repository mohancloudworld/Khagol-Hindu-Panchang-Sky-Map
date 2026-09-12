// Engine smoke test via src/sweph.js: the WASM must reproduce the app's reference sidereal
// Sun/Moon/ayanamsa at JD 2461206.75 (2026-06-15 06:00 UT, Lahiri) to ~arcsec.
// Reference from app/panchang/core.py: sun 59.944911  moon 61.796801  ayanamsa 24.226625
import * as swe from "../src/sweph.js";

const REF = { jd: 2461206.75, sun: 59.944911, moon: 61.796801, ayan: 24.226625 };
const TOL_DEG = 3 / 3600;

await swe.init();
const jd = swe.julday(2026, 6, 15, 6.0);
const [sun, moon] = swe.sunMoonLon(jd, "lahiri");
const ay = swe.ayanamsaDeg(jd, "lahiri");

let ok = true;
for (const [k, got, ref] of [["JD", jd, REF.jd], ["sun", sun, REF.sun], ["moon", moon, REF.moon], ["ayan", ay, REF.ayan]]) {
  const d = Math.abs(got - ref);
  const pass = k === "JD" ? d < 1e-6 : d < TOL_DEG;
  if (!pass) ok = false;
  console.log(`${k.padEnd(5)} got=${got.toFixed(6)} ref=${ref.toFixed(6)} d=${(d * 3600).toFixed(3)}" ${pass ? "OK" : "FAIL"}`);
}
console.log(ok ? "\nSMOKE PASS — WASM matches the app engine." : "\nSMOKE FAIL");
process.exit(ok ? 0 : 1);
