// Validate masa + samvatsara + Ugadi vs the app. Hyderabad, tz +5.5 (Asia/Kolkata).
// App refs: masa "Adhika Jyeshtha", samvatsara 40 Parabhava (2026-06-15); Ugadi 2026 -> 2026-03-19
// (Pratipada kshaya — the known test vector); Ugadi 2025 -> 2025-03-30.
import * as swe from "../src/sweph.js";
import { amantaMasa, samvatsara, findUgadi } from "../src/masa.js";

const lat = 17.385, lon = 78.486, tz = "Asia/Kolkata";
await swe.init();

// sunrise jd for 2026-06-15 (validated earlier ~05:41:40 IST)
const srJd = swe.nextRise(swe.julday(2026, 6, 14, 18.5), lon, lat, 0, true);
const masa = amantaMasa(srJd);
const samv = samvatsara({ y: 2026, mo: 6, d: 15 }, lat, lon, tz);
const ug2026 = findUgadi(2026, lat, lon, tz);
const ug2025 = findUgadi(2025, lat, lon, tz);

const checks = [
  ["masa", masa.name === "Adhika Jyeshtha" && masa.is_adhika === true, `${masa.name} adhika=${masa.is_adhika}`],
  ["samvatsara", samv.number === 40 && samv.name === "Parabhava", `${samv.number} ${samv.name}`],
  ["ugadi 2026", samv.ugadi === "2026-03-19", samv.ugadi],
  ["ugadi 2026 (direct)", `${ug2026.y}-${String(ug2026.mo).padStart(2, "0")}-${String(ug2026.d).padStart(2, "0")}` === "2026-03-19", JSON.stringify(ug2026)],
  ["ugadi 2025", `${ug2025.y}-${String(ug2025.mo).padStart(2, "0")}-${String(ug2025.d).padStart(2, "0")}` === "2025-03-30", JSON.stringify(ug2025)],
];
let ok = true;
for (const [k, pass, got] of checks) { if (!pass) ok = false; console.log(`${k.padEnd(20)} ${got}  ${pass ? "OK" : "FAIL"}`); }
console.log(ok ? "\nMASA/SAMVATSARA PASS — matches the app." : "\nMASA/SAMVATSARA FAIL");
process.exit(ok ? 0 : 1);
