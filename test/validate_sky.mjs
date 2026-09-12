// Validate src/sky.js against the app's /api/sky capture (test/sky_ref.json).
// Moshier vs DE440s: expect ~arcsec agreement on RA/Dec, not bit-exact. alt compared to the
// app's alt_true (geometric) since sky.js omits refraction; az is refraction-invariant.
import { readFileSync } from "node:fs";
import * as swe from "../src/sweph.js";
import { computeSky } from "../src/sky.js";

const ref = JSON.parse(readFileSync(new URL("./sky_ref.json", import.meta.url)));
const TOL = { lst_h: 0.001, ra_h: 0.002, dec_deg: 0.02, alt_deg: 0.05, az_deg: 0.05 };

await swe.init();
const got = computeSky(17.385, 78.486, new Date("2026-06-15T06:00:00Z"), "lahiri");

let ok = true, maxRaArcsec = 0, maxDecArcsec = 0;
const dl = Math.abs(got.lst_hours - ref.lst_hours);
if (dl > TOL.lst_h) ok = false;
console.log(`lst_hours Δ=${(dl * 3600).toFixed(2)}s  ${dl <= TOL.lst_h ? "OK" : "FAIL"}`);

const refBy = Object.fromEntries(ref.bodies.map((b) => [b.id, b]));
for (const g of got.bodies) {
  const r = refBy[g.id];
  const dRa = Math.abs(g.ra_hours - r.ra_hours);
  const dDec = Math.abs(g.dec_deg - r.dec_deg);
  const dAlt = Math.abs(g.alt - r.alt_true);
  const dAz = Math.abs(((g.az - r.az + 540) % 360) - 180);
  maxRaArcsec = Math.max(maxRaArcsec, dRa * 15 * 3600);
  maxDecArcsec = Math.max(maxDecArcsec, dDec * 3600);
  const pass = dRa <= TOL.ra_h && dDec <= TOL.dec_deg && dAlt <= TOL.alt_deg && dAz <= TOL.az_deg;
  if (!pass) ok = false;
  console.log(`${g.id.padEnd(8)} ΔRA=${(dRa * 15 * 3600).toFixed(1)}" ΔDec=${(dDec * 3600).toFixed(1)}" `
    + `Δalt=${(dAlt * 3600).toFixed(1)}" Δaz=${(dAz * 3600).toFixed(1)}" mag ${g.mag}/${r.mag}  ${pass ? "OK" : "FAIL"}`);
}
console.log(`\nmax ΔRA ${maxRaArcsec.toFixed(1)}"  max ΔDec ${maxDecArcsec.toFixed(1)}"`);
console.log(ok ? "SKY PASS — Moshier matches the app within tolerance." : "SKY FAIL");
process.exit(ok ? 0 : 1);
