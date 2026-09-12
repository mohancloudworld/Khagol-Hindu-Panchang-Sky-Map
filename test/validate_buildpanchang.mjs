// Validate buildPanchang() against the full /api/panchang capture (panchang_ref.json),
// Hyderabad 2026-06-15 06:30Z, Asia/Kolkata. Structural fields exact; clock/ISO within tolerance
// (sun ±5 s, moon ±90 s for the rise-algorithm difference).
import { readFileSync } from "node:fs";
import * as swe from "../src/sweph.js";
import { buildPanchang } from "../src/buildpanchang.js";

const ref = JSON.parse(readFileSync(new URL("./panchang_ref.json", import.meta.url)));
await swe.init();
const got = buildPanchang(17.385, 78.486, new Date("2026-06-15T06:30:00Z"), "Asia/Kolkata", "lahiri");

let ok = true;
const eq = (label, a, b) => { const p = a === b; if (!p) ok = false; console.log(`${p ? "OK  " : "FAIL"} ${label}: ${a} ${p ? "" : "!= " + b}`); };
const tsec = (label, a, b, tol) => { const d = Math.abs(Date.parse(`2026-06-15T${a}Z`) - Date.parse(`2026-06-15T${b}Z`)) / 1000; const p = d <= tol; if (!p) ok = false; console.log(`${p ? "OK  " : "FAIL"} ${label}: ${a} vs ${b} (Δ${d}s)`); };
const isosec = (label, a, b, tol) => { const d = Math.abs(Date.parse(a) - Date.parse(b)) / 1000; const p = d <= tol; if (!p) ok = false; console.log(`${p ? "OK  " : "FAIL"} ${label}: Δ${d}s`); };

eq("date_local", got.date_local, ref.date_local);
eq("masa", got.masa.name, ref.masa.name);
eq("samvatsara", `${got.samvatsara.number} ${got.samvatsara.name}`, `${ref.samvatsara.number} ${ref.samvatsara.name}`);
eq("paksha", got.paksha, ref.paksha);
eq("tithi@sr", got.tithi_at_sunrise.display, ref.tithi_at_sunrise.display);
eq("nakshatra@sr", got.nakshatra_at_sunrise.name, ref.nakshatra_at_sunrise.name);
eq("tithi_now#", got.tithi_now.number, ref.tithi_now.number);
eq("yoga", got.yoga.name, ref.yoga.name);
eq("karana", got.karana.name, ref.karana.name);
eq("vara", got.vara, ref.vara);
eq("vara_now", got.solar_day.vara_now, ref.solar_day.vara_now);
eq("is_pre_dawn", got.solar_day.is_pre_dawn, ref.solar_day.is_pre_dawn);
tsec("sunrise", got.sun.sunrise_local, ref.sun.sunrise_local, 5);
tsec("sunset", got.sun.sunset_local, ref.sun.sunset_local, 5);
tsec("moonrise", got.moon.moonrise_local, ref.moon.moonrise_local, 90);
isosec("tithi@sr end", got.tithi_at_sunrise.ends_at_local, ref.tithi_at_sunrise.ends_at_local, 5);
isosec("rahu kalam start", got.kalam.rahu.start, ref.kalam.rahu.start, 5);
isosec("abhijit start", got.muhurta.abhijit.start, ref.muhurta.abhijit.start, 5);
eq("hora[0] lord", got.hora[0].lord, ref.hora[0].lord);
eq("choghadiya[0]", got.choghadiya[0].name, ref.choghadiya[0].name);
eq("ayanamsa_deg", got.ayanamsa_deg, ref.ayanamsa_deg);
eq("festivals count", got.festivals.length, ref.festivals.length);

console.log(ok ? "\nBUILD-PANCHANG PASS — full response matches the app." : "\nBUILD-PANCHANG FAIL");
process.exit(ok ? 0 : 1);
