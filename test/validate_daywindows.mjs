// Validate src/daywindows.js vs /api/panchang (panchang_ref.json), Hyderabad 2026-06-15.
// Feeds my validated sunrise/sunset (±3 s) into the pure-arithmetic windows; tolerance 10 s.
import { readFileSync } from "node:fs";
import * as swe from "../src/sweph.js";
import { kalams, ritualKaals, horas, choghadiya } from "../src/daywindows.js";

const ref = JSON.parse(readFileSync(new URL("./panchang_ref.json", import.meta.url)));
const lat = 17.385, lon = 78.486;
const jdToDate = (jd) => new Date((jd - 2440587.5) * 86400000);
await swe.init();

const sr = jdToDate(swe.nextRise(swe.julday(2026, 6, 14, 18.5), lon, lat, 0, true));
const ss = jdToDate(swe.nextRise(swe.julday(2026, 6, 14, 18.5), lon, lat, 0, false));
const nextSr = jdToDate(swe.nextRise(swe.julday(2026, 6, 15, 18.5), lon, lat, 0, true));
const varaIdx = new Date(Date.UTC(2026, 5, 15)).getUTCDay();   // 2026-06-15 weekday (Sun=0)

const k = kalams(sr, ss, varaIdx);
const rk = ritualKaals(sr, ss, nextSr);
const h0 = horas(sr, ss, nextSr, varaIdx)[0];
const c0 = choghadiya(sr, ss, nextSr, varaIdx)[0];

const dS = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 1000;
let ok = true;
function chk(label, gotStart, gotEnd, refWin, extra = "") {
  const d1 = dS(gotStart.toISOString(), refWin.start), d2 = dS(gotEnd.toISOString(), refWin.end);
  const pass = d1 <= 10 && d2 <= 10;
  if (!pass) ok = false;
  console.log(`${label.padEnd(14)} Δstart=${d1.toFixed(1)}s Δend=${d2.toFixed(1)}s ${extra}  ${pass ? "OK" : "FAIL"}`);
}
chk("rahu kalam", k.rahu.start, k.rahu.end, ref.kalam.rahu);
chk("abhijit", rk.abhijit.start, rk.abhijit.end, ref.muhurta.abhijit);
chk("hora[0]", h0.start, h0.end, ref.hora[0], `lord ${h0.lord}/${ref.hora[0].lord}`);
chk("choghadiya[0]", c0.start, c0.end, ref.choghadiya[0], `${c0.name}/${ref.choghadiya[0].name}`);
const lordOk = h0.lord === ref.hora[0].lord && c0.name === ref.choghadiya[0].name && c0.good === ref.choghadiya[0].good;
if (!lordOk) ok = false;
console.log(ok ? "\nDAY-WINDOWS PASS — matches the app." : "\nDAY-WINDOWS FAIL");
process.exit(ok ? 0 : 1);
