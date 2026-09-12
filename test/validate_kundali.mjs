// Validate src/kundali.js against /api/kundali (test/kundali_ref.json).
// Modern clean case: 2000-01-01 12:00 Asia/Kolkata (UTC 06:30), Hyderabad, mean node, lahiri.
import { readFileSync } from "node:fs";
import * as swe from "../src/sweph.js";
import { computeKundali } from "../src/kundali.js";

const ref = JSON.parse(readFileSync(new URL("./kundali_ref.json", import.meta.url)));
await swe.init();
const got = computeKundali(new Date("2000-01-01T06:30:00Z"), 17.385, 78.486, { node: "mean", ayanamsa: "lahiri", zone: "Asia/Kolkata" });

let ok = true;
const lonTol = 3 / 3600;   // 3"
function chk(label, g, r) {
  const dLon = Math.abs(g.lon - r.lon);
  const pass = dLon <= lonTol && g.rashi === r.rashi && g.navamsa_rashi === r.navamsa_rashi && g.retrograde === r.retrograde;
  if (!pass) ok = false;
  console.log(`${label.padEnd(8)} ΔLon=${(dLon * 3600).toFixed(1)}" rashi ${g.rashi}/${r.rashi} nav ${g.navamsa_rashi}/${r.navamsa_rashi} retro ${g.retrograde}/${r.retrograde}  ${pass ? "OK" : "FAIL"}`);
}
// lagna
const dLag = Math.abs(got.lagna.lon - ref.lagna.lon);
const lagPass = dLag <= lonTol && got.lagna.rashi === ref.lagna.rashi && got.lagna.navamsa_rashi === ref.lagna.navamsa_rashi;
if (!lagPass) ok = false;
console.log(`lagna    ΔLon=${(dLag * 3600).toFixed(1)}" rashi ${got.lagna.rashi}/${ref.lagna.rashi} nav ${got.lagna.navamsa_rashi}/${ref.lagna.navamsa_rashi}  ${lagPass ? "OK" : "FAIL"}`);
const refBy = Object.fromEntries(ref.grahas.map((g) => [g.id, g]));
for (const g of got.grahas) chk(g.id, g, refBy[g.id]);
// birth panchang
const bp = got.birth_panchang.vara === ref.birth_panchang.vara && got.birth_panchang.chandra_rashi === ref.birth_panchang.chandra_rashi;
if (!bp) ok = false;
console.log(`birth    vara ${got.birth_panchang.vara} chandra ${got.birth_panchang.chandra_rashi}  ${bp ? "OK" : "FAIL"}`);
console.log(ok ? "\nKUNDALI CHART PASS — matches the app." : "\nKUNDALI CHART FAIL");
process.exit(ok ? 0 : 1);
