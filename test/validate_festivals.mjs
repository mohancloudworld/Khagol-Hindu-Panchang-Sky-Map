// Validate src/festivals.js vs the app's festivals_in_year(2026) capture (festivals_ref.txt).
// Asserts every festival's name -> date (and disputed flag) match exactly.
import { readFileSync } from "node:fs";
import * as swe from "../src/sweph.js";
import { festivalsInYear } from "../src/festivals.js";

const refLines = readFileSync(new URL("./festivals_ref.txt", import.meta.url), "utf8").trim().split("\n");
const ref = Object.fromEntries(refLines.map((l) => { const [n, d, dis] = l.split("|"); return [n, { date: d, disputed: dis === "True" }]; }));

await swe.init();
const got = festivalsInYear(2026, 17.385, 78.486, "Asia/Kolkata", "lahiri");
const gotBy = Object.fromEntries(got.map((f) => [f.name, f]));

let ok = true;
for (const name of Object.keys(ref)) {
  const g = gotBy[name], r = ref[name];
  const pass = g && g.date === r.date && g.disputed === r.disputed;
  if (!pass) ok = false;
  console.log(`${name.padEnd(24)} ${g ? g.date : "MISSING"} / ${r.date}  disp ${g ? g.disputed : "-"}/${r.disputed}  ${pass ? "OK" : "FAIL"}`);
}
if (got.length !== Object.keys(ref).length) { ok = false; console.log(`count ${got.length} vs ${Object.keys(ref).length}`); }
console.log(ok ? "\nFESTIVALS PASS — all dates match the app." : "\nFESTIVALS FAIL");
process.exit(ok ? 0 : 1);
