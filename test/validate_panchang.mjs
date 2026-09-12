// Validate the JS five-anga port against the app (app/panchang/elements.py) at jd 2461206.75.
// Reference captured from the running app (lahiri):
import * as swe from "../src/sweph.js";
import * as p from "../src/panchang.js";

const REF = {
  tithi:     { num: 1,  name: "Pratipada",  ends: 2461207.45930481 },
  nakshatra: { num: 5,  name: "Mrigashira", ends: 2461207.06851768 },
  yoga:      { num: 10, name: "Ganda",      ends: 2461207.46474075 },
  karana:    { num: 0,  name: "Kimstughna", ends: 2461207.03937340 },
};
const TOL_S = 2;

await swe.init();
const jd = 2461206.75;
const got = { tithi: p.tithi(jd), nakshatra: p.nakshatra(jd), yoga: p.yoga(jd), karana: p.karana(jd) };

let ok = true;
for (const k of Object.keys(REF)) {
  const g = got[k], r = REF[k];
  const num = g.number ?? g.index;
  const dS = Math.abs(g.ends_at_jd - r.ends) * 86400;
  const pass = num === r.num && g.name === r.name && dS < TOL_S;
  if (!pass) ok = false;
  console.log(`${k.padEnd(10)} ${num}/${g.name}  endΔ=${dS.toFixed(2)}s  ${pass ? "OK" : `FAIL (ref ${r.num}/${r.name})`}`);
}
console.log(ok ? "\nPANCHANG PORT PASS — matches the app." : "\nPANCHANG PORT FAIL");
process.exit(ok ? 0 : 1);
