// Edge-robustness: every festival, every year 2020-2030 (Hyderabad), extension vs app.
// 164 dates spanning all trigger types (udaya/sunrise, nishita/midnight, pradosha/sunset,
// aparahna, madhyahna, chandrodaya/moonrise) — naturally includes kshaya/vriddhi and the
// 7 smarta/vaishnava Janmashtami splits. Ground truth = the app (drik + Lahiri, JPL-checked).
import { readFileSync } from "node:fs";
import * as swe from "../src/sweph.js";
import { festivalsInYear } from "../src/festivals.js";

const ref = readFileSync(new URL("./festivals_multiyear_ref.txt", import.meta.url), "utf8").trim().split("\n")
  .map((l) => l.split("|"));   // [year, name, date, disputed]
await swe.init();

let ok = true, n = 0, disputedSeen = 0, fails = [];
for (let y = 2020; y <= 2030; y++) {
  const got = Object.fromEntries(festivalsInYear(y, 17.385, 78.486, "Asia/Kolkata", "lahiri").map((f) => [f.name, f]));
  for (const [yy, name, date, dis] of ref.filter((r) => +r[0] === y)) {
    n++;
    const g = got[name];
    const wantDisputed = dis === "True";
    if (wantDisputed) disputedSeen++;
    if (!g || g.date !== date || g.disputed !== wantDisputed) {
      ok = false; fails.push(`${yy} ${name}: got ${g ? g.date + "/" + g.disputed : "MISSING"} want ${date}/${wantDisputed}`);
    }
  }
}
for (const f of fails.slice(0, 20)) console.log("FAIL " + f);
console.log(`\nchecked ${n} festival-dates over 2020-2030 (${disputedSeen} disputed Janmashtami splits)`);
console.log(ok ? "MULTI-YEAR FESTIVALS PASS — all match the app." : `MULTI-YEAR FESTIVALS FAIL (${fails.length})`);
process.exit(ok ? 0 : 1);
