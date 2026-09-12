// DST location check (Chicago, America/Chicago). Validates the extension's DST-aware tz
// (tz.js via Intl) against the app's ZoneInfo: festival dates + sunrise/sunset clock in
// both CST (winter) and CDT (summer) — the summer case was off by 1 h under the old fixed offset.
import { readFileSync } from "node:fs";
import * as swe from "../src/sweph.js";
import { festivalsInYear } from "../src/festivals.js";
import { riseSetOn, clockHMS } from "../src/suntime.js";

const lat = 41.8781, lon = -87.6298, ZONE = "America/Chicago";
await swe.init();
let ok = true;

// 1) festival dates vs app
const ref = Object.fromEntries(readFileSync(new URL("./festivals_chicago_ref.txt", import.meta.url), "utf8").trim().split("\n").map((l) => l.split("|")));
const got = Object.fromEntries(festivalsInYear(2026, lat, lon, ZONE, "lahiri").map((f) => [f.name, f.date]));
let fdiff = 0;
for (const n of Object.keys(ref)) if (got[n] !== ref[n]) { fdiff++; ok = false; console.log(`FEST FAIL ${n}: ${got[n]} vs ${ref[n]}`); }
console.log(`festivals: ${Object.keys(ref).length - fdiff}/${Object.keys(ref).length} match`);

// 2) sunrise/sunset clock vs app (winter CST, summer CDT). App values captured from /api/panchang.
const dS = (a, b) => { const p = (s) => s.split(":").reduce((x, v) => x * 60 + +v, 0); return Math.abs(p(a) - p(b)); };
const cases = [
  { d: { y: 2026, mo: 1, d: 15 }, sr: "07:15:37", ss: "16:44:41", tag: "winter/CST" },
  { d: { y: 2026, mo: 7, d: 15 }, sr: "05:28:43", ss: "20:23:55", tag: "summer/CDT" },
];
for (const c of cases) {
  const [sr, ss] = riseSetOn(lat, lon, c.d, ZONE);
  const gsr = clockHMS(sr, ZONE), gss = clockHMS(ss, ZONE);
  const pass = dS(gsr, c.sr) <= 5 && dS(gss, c.ss) <= 5;
  if (!pass) ok = false;
  console.log(`${c.tag}: sunrise ${gsr}/${c.sr} (Δ${dS(gsr, c.sr)}s) sunset ${gss}/${c.ss} (Δ${dS(gss, c.ss)}s)  ${pass ? "OK" : "FAIL"}`);
}
console.log(ok ? "\nCHICAGO (DST) PASS — dates + clock match the app in CST and CDT." : "\nCHICAGO FAIL");
process.exit(ok ? 0 : 1);
