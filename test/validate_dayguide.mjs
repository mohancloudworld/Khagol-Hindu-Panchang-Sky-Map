// Validate src/dayguide.js against the inline §B.4 vectors (no ephemeris dependency, so no
// ref JSON -- same vectors are encoded in tests/test_dayguide.py).
import { dayGuidance, _taraBala, _chandraBala } from "../src/dayguide.js";

let ok = true;
function check(label, cond) {
  console.log(`${label}  ${cond ? "OK" : "FAIL"}`);
  if (!cond) ok = false;
}

check("tithi 3 -> Rikta", dayGuidance(3, 0, 1, "Bava", 0).tithi.group === "Rikta");
check("tithi 29 -> Amavasya", dayGuidance(29, 0, 1, "Bava", 0).tithi.group === "Amavasya");
check("tithi 14 -> Purnima", dayGuidance(14, 0, 1, "Bava", 0).tithi.group === "Purnima");

check("yoga 16 -> inauspicious", dayGuidance(0, 0, 16, "Bava", 0).yoga.auspicious === false);
check("yoga 1 -> auspicious", dayGuidance(0, 0, 1, "Bava", 0).yoga.auspicious === true);

check("karana Vishti", dayGuidance(0, 0, 1, "Vishti", 0).karana.text.includes("traditionally avoided"));
check("karana Naga", dayGuidance(0, 0, 1, "Naga", 0).karana.text.includes("fixed karana"));
check("karana Bava", dayGuidance(0, 0, 1, "Bava", 0).karana.text.includes("movable karana"));

{
  const t = _taraBala(0, 3);
  check("tara 0->3: count 4 Kshema fav", t.count === 4 && t.name === "Kshema" && t.favourable === true);
}
{
  const t = _taraBala(3, 0);
  check("tara 3->0: count 25 Vadha unfav", t.count === 25 && t.name === "Vadha" && t.favourable === false);
}

{
  const c = _chandraBala(0, 7);
  check("chandra rashi0->7: house 8 unfav", c.house === 8 && c.favourable === false);
}
{
  const c = _chandraBala(0, 9);
  check("chandra rashi0->9: house 10 fav", c.house === 10 && c.favourable === true);
}

check("personal null without janma", dayGuidance(0, 0, 1, "Bava", 0, null).personal === null);
{
  const d = dayGuidance(0, 0, 1, "Bava", 3, { nakshatra: 0, rashi: 0 });
  check("personal present with janma", d.personal !== null && d.personal.tara.name === "Kshema");
}

console.log(ok ? "\nDAYGUIDE PASS — matches the app." : "\nDAYGUIDE FAIL");
process.exit(ok ? 0 : 1);
