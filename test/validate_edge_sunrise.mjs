// Razor-edge udaya cases: days where a tithi boundary lands within minutes of sunrise, so
// "tithi at sunrise" is decided by a hair. Tightest in 2026 is 2026-03-13 (boundary +3.7 min).
// Asserts the extension's tithi/nakshatra AT its own computed sunrise match the app — i.e. the
// ±3 s sunrise difference never flips the result (3.7 min margin >> 3 s).
import { readFileSync } from "node:fs";
import * as swe from "../src/sweph.js";
import { tithi, nakshatra } from "../src/panchang.js";
import { sunriseOn } from "../src/suntime.js";

const ref = readFileSync(new URL("./edge_sunrise_ref.txt", import.meta.url), "utf8").trim().split("\n").map((l) => l.split("|"));
const lat = 17.385, lon = 78.486, tz = "Asia/Kolkata";
const dateToJd = (dt) => dt.getTime() / 86400000 + 2440587.5;
await swe.init();

let ok = true;
for (const [ds, tDisplay, tNum, nName, nNum] of ref) {
  const [y, m, d] = ds.split("-").map(Number);
  const sr = sunriseOn(lat, lon, { y, mo: m, d }, tz);
  const jd = dateToJd(sr);
  const t = tithi(jd, "lahiri"), nk = nakshatra(jd, "lahiri");
  const pass = t.display === tDisplay && t.number === +tNum && nk.name === nName && nk.number === +nNum;
  if (!pass) ok = false;
  console.log(`${ds}  tithi@sr ${t.display}(${t.number})/${tDisplay}(${tNum})  nak ${nk.name}/${nName}  ${pass ? "OK" : "FAIL"}`);
}
console.log(ok ? "EDGE-SUNRISE PASS — tithi/nakshatra at sunrise match the app on razor-edge days." : "EDGE-SUNRISE FAIL");
process.exit(ok ? 0 : 1);
