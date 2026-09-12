// Validate src/orrery.js vs /api/orrery (test/orrery_ref.json) at 2026-06-15 06:00Z.
// App XYZ is barycentric, mine heliocentric -> compare my XYZ to the app's (body - sun).
// helio distance, geo_lon, and rashi are frame-independent and compared directly.
import { readFileSync } from "node:fs";
import * as swe from "../src/sweph.js";
import { computeOrrery } from "../src/orrery.js";

const ref = JSON.parse(readFileSync(new URL("./orrery_ref.json", import.meta.url)));
await swe.init();
const got = computeOrrery(new Date("2026-06-15T06:00:00Z"), "lahiri");

const refBy = Object.fromEntries(ref.bodies.map((b) => [b.id, b]));
const sun = refBy.sun;
const TOL = { xyz: 1e-3, helio: 1e-3, lon: 0.01 };
let ok = true, maxXyz = 0;
for (const g of got.bodies) {
  const r = refBy[g.id];
  const dx = Math.abs(g.x - (r.x - sun.x)), dy = Math.abs(g.y - (r.y - sun.y)), dz = Math.abs(g.z - (r.z - sun.z));
  const dXYZ = Math.max(dx, dy, dz);
  maxXyz = Math.max(maxXyz, dXYZ);
  const dHelio = Math.abs(g.helio_au - r.helio_au);
  const dLon = g.geo_lon != null ? Math.abs(((g.geo_lon - r.geo_lon + 540) % 360) - 180) : 0;
  const rashiOk = g.rashi_geocentric === r.rashi_geocentric;
  const pass = dXYZ <= TOL.xyz && dHelio <= TOL.helio && dLon <= TOL.lon && rashiOk;
  if (!pass) ok = false;
  console.log(`${g.id.padEnd(8)} ΔXYZ=${dXYZ.toExponential(1)}AU Δhelio=${dHelio.toExponential(1)} `
    + `Δlon=${(dLon * 3600).toFixed(1)}" rashi ${g.rashi_geocentric}/${r.rashi_geocentric}  ${pass ? "OK" : "FAIL"}`);
}
console.log(`\nmax ΔXYZ ${maxXyz.toExponential(2)} AU`);
console.log(ok ? "ORRERY PASS — heliocentric matches the app within tolerance." : "ORRERY FAIL");
process.exit(ok ? 0 : 1);
