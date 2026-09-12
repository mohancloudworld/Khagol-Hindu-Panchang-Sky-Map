// Kundali Milan -- classical ashtakoota (36-guna) match-making + Mangal (kuja) dosha check
// (Section C). Ported line-faithfully from app/panchang/matching.py, operating on two already-
// computed computeKundali() results.
//
// Convention (Section 0.4): mainstream North-Indian ashtakoota, whole-sign vashya, NO
// dosha-cancellation rules -- v1. Person A is the vara (groom), person B the kanya (bride) for
// the direction-sensitive kootas (varna, tara, gana).
//
// Language contract (Section 0.3): descriptive only. Never "do not marry", "incompatible", or
// any imperative advice.
import { GRAHA_NAME, NAKSHATRA_PROFILE, RASHI_LORD } from "./interpret.js";
import {
  BHAKOOT_DOSHA_SETS, GANA_MATRIX, GRAHA_MAITRI, MANGAL_DOSHA_HOUSES,
  NADI_OF_NAKSHATRA_MOD6, TARA_UNFAVOURABLE, VARNA_GROUPS, VARNA_RANK, VASHYA_GROUPS,
  VASHYA_MATRIX, VASHYA_ORDER, YONI_DISPLAY, YONI_MATRIX, YONI_OF_NAKSHATRA, YONI_ORDER,
} from "./matchtables.js";
import { RASHI } from "./names.js";

export const DISCLAIMER = "Computed from the classical ashtakoota (36-guna) system for study and "
  + "cultural reference — not advice on any relationship or marriage. Conventions "
  + "vary by region and school; a qualified astrologer weighs far more than a score.";
export const CONVENTION = "North-Indian ashtakoota, whole-sign vashya, no cancellation rules (v1)";

const _ORD = { 1: "1st", 2: "2nd", 3: "3rd" };
function _ordinal(n) { return n in _ORD ? _ORD[n] : `${n}th`; }

function _groupOf(rashi, groups) {
  for (const [name, members] of Object.entries(groups)) {
    if (members.includes(rashi)) return name;
  }
  throw new Error(`rashi ${rashi} not in any group`);
}

export function varnaOf(rashi) { return _groupOf(rashi, VARNA_GROUPS); }
export function vashyaOf(rashi) { return _groupOf(rashi, VASHYA_GROUPS); }
export function yoniOf(nakshatraIndex) { return YONI_OF_NAKSHATRA[nakshatraIndex]; }
export function ganaOf(nakshatraIndex) { return NAKSHATRA_PROFILE[nakshatraIndex][2]; }
export function nadiOf(nakshatraIndex) { return NADI_OF_NAKSHATRA_MOD6[nakshatraIndex % 6]; }

// --- C.2.1 Varna (max 1) ----------------------------------------------------------------------
export function varnaKoota(rashiA, rashiB) {
  const rankA = VARNA_RANK[varnaOf(rashiA)], rankB = VARNA_RANK[varnaOf(rashiB)];
  return rankA >= rankB ? 1.0 : 0.0;
}

// --- C.2.2 Vashya (max 2) ---------------------------------------------------------------------
export function vashyaKoota(rashiA, rashiB) {
  const ia = VASHYA_ORDER.indexOf(vashyaOf(rashiA)), ib = VASHYA_ORDER.indexOf(vashyaOf(rashiB));
  return VASHYA_MATRIX[ia][ib];
}

// --- C.2.3 Tara (max 3) -----------------------------------------------------------------------
function _taraNumber(count) { return ((count - 1) % 9) + 1; }

export function taraKoota(nakA, nakB) {
  const cAB = ((nakB - nakA + 27) % 27) + 1;
  const cBA = ((nakA - nakB + 27) % 27) + 1;
  let total = 0.0;
  if (!TARA_UNFAVOURABLE.has(_taraNumber(cAB))) total += 1.5;
  if (!TARA_UNFAVOURABLE.has(_taraNumber(cBA))) total += 1.5;
  return total;
}

// --- C.2.4 Yoni (max 4) -----------------------------------------------------------------------
export function yoniKoota(nakA, nakB) {
  const ia = YONI_ORDER.indexOf(yoniOf(nakA)), ib = YONI_ORDER.indexOf(yoniOf(nakB));
  return YONI_MATRIX[ia][ib];
}

// --- C.2.5 Graha Maitri (max 5) -----------------------------------------------------------------
function _relation(viewer, other) {
  if (viewer === other) return "friend";
  const rel = GRAHA_MAITRI[viewer];
  if (rel.friends.has(other)) return "friend";
  if (rel.enemies.has(other)) return "enemy";
  return "neutral";
}

export function maitriKoota(rashiA, rashiB) {
  const lordA = RASHI_LORD[rashiA], lordB = RASHI_LORD[rashiB];
  if (lordA === lordB) return 5.0;
  const pair = [_relation(lordA, lordB), _relation(lordB, lordA)].sort().join(",");
  if (pair === "friend,friend") return 5.0;
  if (pair === "friend,neutral") return 4.0;
  if (pair === "neutral,neutral") return 3.0;
  if (pair === "enemy,friend") return 1.0;
  if (pair === "enemy,neutral") return 0.5;
  return 0.0;   // both enemy
}

// --- C.2.6 Gana (max 6) ------------------------------------------------------------------------
export function ganaKoota(nakA, nakB) { return GANA_MATRIX[ganaOf(nakA)][ganaOf(nakB)]; }

// --- C.2.7 Bhakoot (max 7) --------------------------------------------------------------------
function _bhakootDistances(rashiA, rashiB) {
  const d1 = ((rashiB - rashiA + 12) % 12) + 1;
  const d2 = ((rashiA - rashiB + 12) % 12) + 1;
  return [d1, d2];
}

export function bhakootKoota(rashiA, rashiB) {
  const [d1, d2] = _bhakootDistances(rashiA, rashiB);
  const pair = [d1, d2].sort((x, y) => x - y).join(",");
  const dosha = BHAKOOT_DOSHA_SETS.some((s) => [...s].sort((x, y) => x - y).join(",") === pair);
  return dosha ? 0.0 : 7.0;
}

// --- C.2.8 Nadi (max 8) ------------------------------------------------------------------------
export function nadiKoota(nakA, nakB) { return nadiOf(nakA) === nadiOf(nakB) ? 0.0 : 8.0; }

// --- C.2.9 Mangal dosha (reported, not scored) -------------------------------------------------
export function mangalHouse(marsRashi, refRashi) { return ((marsRashi - refRashi + 12) % 12) + 1; }
export function mangalIndicated(house) { return MANGAL_DOSHA_HOUSES.has(house); }

function _band(total) {
  if (total >= 33) return ["excellent", "An excellent score in the classical ashtakoota system."];
  if (total >= 25) return ["very_good", "A very good score in the classical ashtakoota system."];
  if (total >= 18) return ["acceptable", "Classically regarded as an acceptable score."];
  return ["low", "Classically regarded as a low score; tradition counsels seeking a "
    + "qualified astrologer's guidance."];
}

function _personSummary(k) {
  const moon = k.grahas.find((g) => g.id === "moon");
  const mars = k.grahas.find((g) => g.id === "mars");
  const nakIndex = Math.floor(moon.lon / (360.0 / 27.0));
  const rashi = moon.rashi;
  const lord = RASHI_LORD[rashi];
  return {
    nakshatra: moon.nakshatra, nakshatra_index: nakIndex, pada: moon.pada,
    rashi, rashi_name: RASHI[rashi], lord: GRAHA_NAME[lord],
    varna: varnaOf(rashi), vashya: vashyaOf(rashi), gana: ganaOf(nakIndex),
    nadi: nadiOf(nakIndex), yoni: YONI_DISPLAY[yoniOf(nakIndex)],
    lagna_rashi: k.lagna.rashi, mars_rashi: mars.rashi,
  };
}

export function matchKundali(kundaliA, kundaliB) {
  const a = _personSummary(kundaliA), b = _personSummary(kundaliB);
  const nakA = a.nakshatra_index, nakB = b.nakshatra_index;
  const rashiA = a.rashi, rashiB = b.rashi;

  const varnaPts = varnaKoota(rashiA, rashiB);
  const vashyaPts = vashyaKoota(rashiA, rashiB);
  const taraPts = taraKoota(nakA, nakB);
  const yoniPts = yoniKoota(nakA, nakB);
  const maitriPts = maitriKoota(rashiA, rashiB);
  const ganaPts = ganaKoota(nakA, nakB);
  const bhakootPts = bhakootKoota(rashiA, rashiB);
  const nadiPts = nadiKoota(nakA, nakB);

  const [d1, d2] = _bhakootDistances(rashiA, rashiB);

  const kootas = [
    { key: "varna", max: 1, points: varnaPts, a: a.varna, b: b.varna, note: "temperamental hierarchy" },
    { key: "vashya", max: 2, points: vashyaPts, a: a.vashya, b: b.vashya, note: "mutual influence" },
    { key: "tara", max: 3, points: taraPts, a: a.nakshatra, b: b.nakshatra, note: "destiny and well-being" },
    { key: "yoni", max: 4, points: yoniPts, a: a.yoni, b: b.yoni, note: "instinctive compatibility" },
    { key: "maitri", max: 5, points: maitriPts, a: a.lord, b: b.lord, note: "friendship of the mind lords" },
    { key: "gana", max: 6, points: ganaPts, a: a.gana, b: b.gana, note: "temperament class" },
    { key: "bhakoot", max: 7, points: bhakootPts, a: _ordinal(d1), b: _ordinal(d2), note: "emotional resonance of the moon signs" },
    { key: "nadi", max: 8, points: nadiPts, a: a.nadi, b: b.nadi, note: "constitutional compatibility (prakriti)" },
  ];
  const totalPoints = kootas.reduce((s, k) => s + k.points, 0);
  const [band, bandText] = _band(totalPoints);

  const notes = [];
  if (nadiPts === 0) {
    notes.push("Nadi koota scores 0 (same nadi) — classically given particular weight; "
      + "cancellation rules exist in tradition but are not evaluated in this version.");
  }
  if (bhakootPts === 0) {
    notes.push("Bhakoot koota scores 0 — classically given particular weight; exemption "
      + "rules exist in tradition but are not evaluated in this version.");
  }

  const mangalA = { from_lagna: mangalHouse(a.mars_rashi, a.lagna_rashi),
    from_moon: mangalHouse(a.mars_rashi, a.rashi) };
  mangalA.indicated = mangalIndicated(mangalA.from_lagna) || mangalIndicated(mangalA.from_moon);
  const mangalB = { from_lagna: mangalHouse(b.mars_rashi, b.lagna_rashi),
    from_moon: mangalHouse(b.mars_rashi, b.rashi) };
  mangalB.indicated = mangalIndicated(mangalB.from_lagna) || mangalIndicated(mangalB.from_moon);
  let mangalNote = "Mangal (kuja) dosha is checked from both the lagna and the chandra rashi; "
    + "the 2nd-house inclusion in the dosha-bhava set follows the South-Indian convention "
    + "(some traditions omit it).";
  if (mangalA.indicated && mangalB.indicated) {
    mangalNote += " Both charts indicate Mangala in a kuja-dosha bhava — classically "
      + "considered mutually neutralised.";
  }

  const _public = (p) => {
    const { lagna_rashi, mars_rashi, ...rest } = p;
    return rest;
  };

  return {
    a: _public(a), b: _public(b),
    kootas,
    total: { points: totalPoints, max: 36, band, text: bandText },
    doshas: { nadi: nadiPts === 0, bhakoot: bhakootPts === 0, notes },
    mangal: { a: mangalA, b: mangalB, note: mangalNote },
    convention: CONVENTION,
    disclaimer: DISCLAIMER,
  };
}
