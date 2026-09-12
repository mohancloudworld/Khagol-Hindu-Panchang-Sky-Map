// Panchang "Today's guidance" -- deterministic daily significance card. Pure tables +
// arithmetic, NO ephemeris dependency -- ported line-faithfully from
// app/panchang/dayguide.py.
import { YOGA } from "./names.js";

export const DISCLAIMER = "Generated from classical panchanga significations for study and "
  + "cultural reference — not advice. Traditions vary by region and school.";

// --- tithi groups -----------------------------------------------------------------------
const _TITHI_GROUP = {
  1: ["Nanda", "a Nanda (joy) tithi — classically favoured for celebrations, music, art and pleasurable undertakings"],
  6: ["Nanda", "a Nanda (joy) tithi — classically favoured for celebrations, music, art and pleasurable undertakings"],
  11: ["Nanda", "a Nanda (joy) tithi — classically favoured for celebrations, music, art and pleasurable undertakings"],
  2: ["Bhadra", "a Bhadra (auspicious) tithi — classically favoured for new beginnings, health matters, travel and trade"],
  7: ["Bhadra", "a Bhadra (auspicious) tithi — classically favoured for new beginnings, health matters, travel and trade"],
  12: ["Bhadra", "a Bhadra (auspicious) tithi — classically favoured for new beginnings, health matters, travel and trade"],
  3: ["Jaya", "a Jaya (victory) tithi — classically favoured for competitive efforts, disputes to be settled and courageous acts"],
  8: ["Jaya", "a Jaya (victory) tithi — classically favoured for competitive efforts, disputes to be settled and courageous acts"],
  13: ["Jaya", "a Jaya (victory) tithi — classically favoured for competitive efforts, disputes to be settled and courageous acts"],
  4: ["Rikta", "a Rikta (empty) tithi — traditionally avoided for auspicious beginnings; suited to clearing, cleaning and ending matters"],
  9: ["Rikta", "a Rikta (empty) tithi — traditionally avoided for auspicious beginnings; suited to clearing, cleaning and ending matters"],
  14: ["Rikta", "a Rikta (empty) tithi — traditionally avoided for auspicious beginnings; suited to clearing, cleaning and ending matters"],
  5: ["Purna", "a Purna (full) tithi — classically favoured for completion, marriage ceremonies and grand undertakings"],
  10: ["Purna", "a Purna (full) tithi — classically favoured for completion, marriage ceremonies and grand undertakings"],
};
const _PURNIMA = ["Purnima", "Purnima — fullness; classically favoured for vratas, worship and completion."];
const _AMAVASYA = ["Amavasya", "Amavasya — traditionally reserved for ancestor rites (tarpana); new ventures are classically deferred."];

// --- vara guidance ------------------------------------------------------------------------
const _VARA_TEXT = [
  "ruled by Surya — classically suited to matters of authority, health, and service to the father/state",
  "ruled by Chandra — classically suited to emotional matters, gardening, travel and the public",
  "ruled by Mangala — classically suited to courageous, forceful work; new ventures are traditionally deferred",
  "ruled by Budha — classically suited to commerce, learning, writing and communication",
  "ruled by Guru — classically suited to education, ceremonies, finance and counsel",
  "ruled by Shukra — classically suited to arts, romance, comforts and fine things",
  "ruled by Shani — classically suited to labour, discipline and long-term efforts; new ventures are traditionally deferred",
];

// --- yoga ----------------------------------------------------------------------------------
const _INAUSPICIOUS_YOGA = new Set([0, 5, 8, 9, 12, 14, 16, 18, 26]);
const _YOGA_AUSPICIOUS_TEXT = "an auspicious yoga, classically supportive of undertakings";
const _YOGA_INAUSPICIOUS_TEXT = "classically counted among the inauspicious yogas — important beginnings are traditionally deferred";

// --- karana --------------------------------------------------------------------------------
const _KARANA_FIXED = new Set(["Shakuni", "Chatushpada", "Naga", "Kimstughna"]);
const _KARANA_VISHTI_TEXT = "Vishti (Bhadra) karana — traditionally avoided for auspicious work";
const _KARANA_FIXED_TEXT = "a fixed karana, classically reserved for specific rites rather than general undertakings";
const _KARANA_MOVABLE_TEXT = "a movable karana, classically neutral-to-favourable for general work";

// --- tara-bala -------------------------------------------------------------------------------
const _TARA_NAME = ["Janma", "Sampat", "Vipat", "Kshema", "Pratyari", "Sadhaka", "Vadha", "Mitra", "Parama Mitra"];
const _TARA_UNFAVOURABLE = new Set([3, 5, 7]);

// --- chandra-bala ----------------------------------------------------------------------------
const _CHANDRA_BALA_LOW_TEXT = "classically low chandra-bala — a quieter day";
const _CHANDRA_BALA_OK_TEXT = "supportive chandra-bala";
const _CHANDRA_BALA_LOW_HOUSES = new Set([4, 8, 12]);

function _tithiGuidance(tithiIndex) {
  let group, text;
  if (tithiIndex === 14) [group, text] = _PURNIMA;
  else if (tithiIndex === 29) [group, text] = _AMAVASYA;
  else {
    const pakshaTithi = (tithiIndex % 15) + 1;
    [group, text] = _TITHI_GROUP[pakshaTithi];
  }
  return { group, text };
}

function _varaGuidance(varaIndex) {
  return { text: _VARA_TEXT[varaIndex] };
}

function _yogaGuidance(yogaIndex) {
  const auspicious = !_INAUSPICIOUS_YOGA.has(yogaIndex);
  return { name: YOGA[yogaIndex], auspicious, text: auspicious ? _YOGA_AUSPICIOUS_TEXT : _YOGA_INAUSPICIOUS_TEXT };
}

function _karanaGuidance(karanaName) {
  let text;
  if (karanaName === "Vishti") text = _KARANA_VISHTI_TEXT;
  else if (_KARANA_FIXED.has(karanaName)) text = _KARANA_FIXED_TEXT;
  else text = _KARANA_MOVABLE_TEXT;
  return { name: karanaName, text };
}

export function _taraBala(janmaNakshatra, todayNakshatra) {
  const count = ((todayNakshatra - janmaNakshatra + 27) % 27) + 1;
  const tara = ((count - 1) % 9) + 1;
  const name = _TARA_NAME[tara - 1];
  const favourable = !_TARA_UNFAVOURABLE.has(tara);
  let text;
  if (_TARA_UNFAVOURABLE.has(tara)) {
    text = `${name} tara — classically considered unfavourable; important undertakings are traditionally deferred.`;
  } else if (tara === 1) {
    text = `${name} tara — classically considered a mixed influence today.`;
  } else {
    text = `${name} tara — classically considered favourable for undertakings.`;
  }
  return { count, name, favourable, text };
}

export function _chandraBala(janmaRashi, todayMoonRashi) {
  const house = ((todayMoonRashi - janmaRashi + 12) % 12) + 1;
  const favourable = !_CHANDRA_BALA_LOW_HOUSES.has(house);
  const text = favourable ? _CHANDRA_BALA_OK_TEXT : _CHANDRA_BALA_LOW_TEXT;
  return { house, favourable, text };
}

function _rashiOfNakshatra(nakshatraIndex) {
  // Rashi containing the START of a nakshatra (v1 simplification: a nakshatra can straddle
  // two rashis -- see DEVIATIONS.md -- so this is an approximation good enough for the
  // chandra-bala headline, not a substitute for the exact natal/transit rashi).
  return Math.floor(Math.floor((nakshatraIndex * 360) / 27) / 30);
}

export function dayGuidance(tithiIndex, varaIndex, yogaIndex, karanaName, nakshatraIndex, janma = null) {
  let personal = null;
  if (janma !== null) {
    const todayMoonRashi = _rashiOfNakshatra(nakshatraIndex);
    personal = {
      tara: _taraBala(janma.nakshatra, nakshatraIndex),
      chandra_bala: _chandraBala(janma.rashi, todayMoonRashi),
    };
  }
  return {
    tithi: _tithiGuidance(tithiIndex),
    vara: _varaGuidance(varaIndex),
    yoga: _yogaGuidance(yogaIndex),
    karana: _karanaGuidance(karanaName),
    personal,
    disclaimer: DISCLAIMER,
  };
}
