// Validate src/matching.js: koota-level §C.6 vectors, yoni-matrix invariants, and full parity
// against the app's /api/match output for S1 x S2 (test/match_ref.json).
import { readFileSync } from "node:fs";
import * as swe from "../src/sweph.js";
import { computeKundali } from "../src/kundali.js";
import {
  bhakootKoota, ganaKoota, maitriKoota, mangalHouse, mangalIndicated, matchKundali, nadiKoota,
  taraKoota, varnaKoota, vashyaKoota, yoniKoota,
} from "../src/matching.js";
import { YONI_MATRIX, YONI_ORDER } from "../src/matchtables.js";

let ok = true;
function check(label, cond) {
  console.log(`${label}  ${cond ? "OK" : "FAIL"}`);
  if (!cond) ok = false;
}

check("varna 0,3 -> 0", varnaKoota(0, 3) === 0);
check("varna 3,0 -> 1", varnaKoota(3, 0) === 1);
check("vashya 3,11 -> 2", vashyaKoota(3, 11) === 2);
check("vashya 4,2 -> 0", vashyaKoota(4, 2) === 0);
check("tara 0,3 -> 1.5", taraKoota(0, 3) === 1.5);
check("tara 0,1 -> 3", taraKoota(0, 1) === 3);
check("yoni 0,23 -> 4", yoniKoota(0, 23) === 4);
check("yoni 0,12 -> 0", yoniKoota(0, 12) === 0);
check("yoni 3,0 -> 3", yoniKoota(3, 0) === 3);
check("maitri 4,0 -> 5", maitriKoota(4, 0) === 5);
check("maitri 4,1 -> 0", maitriKoota(4, 1) === 0);
check("maitri 0,7 -> 5", maitriKoota(0, 7) === 5);
check("gana 0,2 -> 0", ganaKoota(0, 2) === 0);
check("gana 2,0 -> 1", ganaKoota(2, 0) === 1);
check("bhakoot 0,7 -> 0", bhakootKoota(0, 7) === 0);
check("bhakoot 0,4 -> 0", bhakootKoota(0, 4) === 0);
check("bhakoot 0,6 -> 7", bhakootKoota(0, 6) === 7);
check("nadi 0,1 -> 8", nadiKoota(0, 1) === 8);
check("nadi 0,5 -> 0", nadiKoota(0, 5) === 0);
check("mangal house(6,0)=7 indicated", mangalIndicated(mangalHouse(6, 0)) === true);
check("mangal house(2,0)=3 not indicated", mangalIndicated(mangalHouse(2, 0)) === false);

// Yoni matrix invariants.
{
  const n = YONI_ORDER.length;
  let sym = true, diag = true;
  for (let i = 0; i < n; i++) {
    if (YONI_MATRIX[i][i] !== 4) diag = false;
    for (let j = 0; j < n; j++) if (YONI_MATRIX[i][j] !== YONI_MATRIX[j][i]) sym = false;
  }
  check("yoni matrix diagonal=4", diag);
  check("yoni matrix symmetric", sym);
  const vaira = [["Ashva", "Mahisha"], ["Gaja", "Simha"], ["Mesha", "Vanara"], ["Sarpa", "Nakula"],
    ["Shvana", "Mriga"], ["Marjara", "Mushaka"], ["Gau", "Vyaghra"]];
  const vairaOk = vaira.every(([x, y]) => YONI_MATRIX[YONI_ORDER.indexOf(x)][YONI_ORDER.indexOf(y)] === 0);
  check("yoni vaira pairs = 0", vairaOk);
}

// Whole-couple identity check (§C.6): both persons Moon in Ashwini / rashi Mesha.
{
  const fake = {
    lagna: { rashi: 0 },
    grahas: [
      { id: "moon", lon: 1.0, rashi: 0, nakshatra: "Ashwini", pada: 1 },
      { id: "mars", lon: 1.0, rashi: 0 },
    ],
  };
  const m = matchKundali(fake, fake);
  const pts = Object.fromEntries(m.kootas.map((k) => [k.key, k.points]));
  const expected = { varna: 1, vashya: 2, tara: 3, yoni: 4, maitri: 5, gana: 6, bhakoot: 7, nadi: 0 };
  const identityOk = Object.keys(expected).every((k) => pts[k] === expected[k])
    && m.total.points === 28 && m.total.band === "very_good"
    && m.doshas.nadi === true && m.doshas.bhakoot === false;
  check("identity couple: total 28, very_good, nadi dosha", identityOk);
}

// Wording audit.
{
  const fake = { lagna: { rashi: 0 }, grahas: [{ id: "moon", lon: 1.0, rashi: 0, nakshatra: "Ashwini", pada: 1 }, { id: "mars", lon: 1.0, rashi: 0 }] };
  const m = matchKundali(fake, fake);
  const blob = [m.disclaimer, m.convention, m.total.text, m.mangal.note, ...m.doshas.notes, ...m.kootas.map((k) => k.note)].join(" ").toLowerCase();
  check("no imperative wording", !blob.includes("should") && !blob.includes("must") && !blob.includes("will "));
}

// Port parity: S1 x S2 against the app's /api/match capture.
await swe.init();
const ref = JSON.parse(readFileSync(new URL("./match_ref.json", import.meta.url)));
const kA = computeKundali(new Date("2000-01-01T06:30:00Z"), 17.385, 78.486, { node: "mean", ayanamsa: "lahiri", zone: "Asia/Kolkata" });
const kB = computeKundali(new Date("1998-07-15T01:15:00Z"), 28.61, 77.21, { node: "mean", ayanamsa: "lahiri", zone: "Asia/Kolkata" });
const got = matchKundali(kA, kB);

function firstDiff(path, x, y) {
  if (x === y) return null;
  if (typeof x !== typeof y) return { path, x, y };
  if (x === null || y === null || typeof x !== "object") return { path, x, y };
  if (Array.isArray(x) !== Array.isArray(y)) return { path, x, y };
  if (Array.isArray(x)) {
    if (x.length !== y.length) return { path: `${path}.length`, x: x.length, y: y.length };
    for (let i = 0; i < x.length; i++) { const d = firstDiff(`${path}[${i}]`, x[i], y[i]); if (d) return d; }
    return null;
  }
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  for (const k of keys) { const d = firstDiff(`${path}.${k}`, x[k], y[k]); if (d) return d; }
  return null;
}
const diff = firstDiff("match", got, ref);
if (diff) {
  console.log(`FIRST DIFF at ${diff.path}: got=${JSON.stringify(diff.x)} ref=${JSON.stringify(diff.y)}`);
  ok = false;
} else {
  console.log("S1 x S2 matches /api/match byte-for-byte");
}

console.log(ok ? "\nMATCHING PASS — matches the app." : "\nMATCHING FAIL");
process.exit(ok ? 0 : 1);
