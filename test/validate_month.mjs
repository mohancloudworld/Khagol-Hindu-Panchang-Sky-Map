import { readFileSync } from "node:fs";
import * as swe from "../src/sweph.js";
import { buildMonth } from "../src/buildpanchang.js";
const ref = JSON.parse(readFileSync(new URL("./month_ref.json", import.meta.url)));
await swe.init();
const got = buildMonth(2026, 6, 17.385, 78.486, "Asia/Kolkata", "lahiri");
let ok = true;
if (got.length !== ref.length) { ok = false; console.log(`len ${got.length} vs ${ref.length}`); }
let sankrantis = 0, festDays = 0;
for (let i = 0; i < ref.length; i++) {
  const g = got[i], r = ref[i];
  const base = g.date === r.date && g.vara === r.vara && g.tithi_at_sunrise === r.tithi_at_sunrise
    && g.nakshatra_at_sunrise === r.nakshatra_at_sunrise && g.masa === r.masa && g.paksha === r.paksha
    && g.is_ekadashi === r.is_ekadashi && g.is_purnima === r.is_purnima && g.is_amavasya === r.is_amavasya;
  const gf = g.festivals.map((f) => f.name).sort().join(","), rf = r.festivals.map((f) => f.name).sort().join(",");
  if (rf) festDays++;
  if (rf.includes("Sankranti")) sankrantis++;
  if (!base || gf !== rf) { ok = false; console.log(`FAIL ${r.date}: base=${base} fest "${gf}" vs "${rf}"`); }
}
console.log(`${ref.length} days checked, ${festDays} with festivals/sankranti (${sankrantis} sankranti)`);
console.log(ok ? "BUILD-MONTH PASS — matches the app." : "BUILD-MONTH FAIL");
process.exit(ok ? 0 : 1);
