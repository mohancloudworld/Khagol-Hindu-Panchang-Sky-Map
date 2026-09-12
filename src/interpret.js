// Rule-based jyotisha interpretation layer — line-faithful port of app/panchang/interpret.py
// (Section 9C). Every sentence is generated deterministically from the static signification
// tables below -- offline, no AI. The language is intentionally descriptive ("classically
// signifies", "traditionally associated with"), never predictive.
//
// The single entry point is `interpret`, fed the already-computed natal grahas + lagna
// (Section 9B), the current maha/antar dasha, and the *current* transit rashis (gochara).
import { RASHI } from "./names.js";

export const DISCLAIMER = "Generated from classical jyotisha significations for study and cultural "
  + "reference — not a personalized reading or professional advice.";

// --- rashi attributes (Section 9C.1) -------------------------------------------------------
// Element cycle fire/earth/air/water from Mesha; modality movable/fixed/dual from Mesha.
const _ELEMENT = ["Agni (fire)", "Prithvi (earth)", "Vayu (air)", "Jala (water)"];
const _MODALITY = { 0: "Chara (movable)", 1: "Sthira (fixed)", 2: "Dvisvabhava (dual)" };
export const RASHI_LORD = ["mars", "venus", "mercury", "moon", "sun", "mercury",
  "venus", "mars", "jupiter", "saturn", "saturn", "jupiter"];
// A short neutral temperament phrase per rashi (the descriptive seed).
export const RASHI_KEYWORDS = [
  "assertive, pioneering, quick to act",                 // Mesha
  "steady, sensual, value-seeking",                      // Vrishabha
  "curious, communicative, versatile",                   // Mithuna
  "nurturing, sensitive, protective",                     // Karka
  "confident, expressive, dignified",                    // Simha
  "analytical, precise, service-minded",                 // Kanya
  "harmonious, diplomatic, relational",                  // Tula
  "intense, private, transformative",                    // Vrischika
  "expansive, philosophical, optimistic",                // Dhanu
  "disciplined, ambitious, pragmatic",                    // Makara
  "independent, humanitarian, inventive",                // Kumbha
  "compassionate, imaginative, receptive",                // Meena
];

export const GRAHA_NAME = { sun: "Sun", moon: "Moon", mars: "Mars", mercury: "Mercury",
  jupiter: "Jupiter", venus: "Venus", saturn: "Saturn", rahu: "Rahu", ketu: "Ketu" };

// --- nakshatra profiles (Section 9C.2): deity, symbol, gana, keyword phrase -----------------
export const NAKSHATRA_PROFILE = [
  ["Ashwini Kumaras", "horse's head", "Deva", "swift, healing, pioneering energy"],
  ["Yama", "yoni (bearing)", "Manushya", "restraint, endurance, creative bearing"],
  ["Agni", "razor / flame", "Rakshasa", "sharp, purifying, determined drive"],
  ["Brahma (Prajapati)", "cart / chariot", "Manushya", "growth, beauty, fertile steadiness"],
  ["Soma (Chandra)", "deer's head", "Deva", "searching, gentle curiosity"],
  ["Rudra", "teardrop / gem", "Manushya", "intensity, upheaval, transformative effort"],
  ["Aditi", "bow & quiver", "Deva", "renewal, return, nurturing safety"],
  ["Brihaspati", "cow's udder / flower", "Deva", "nourishment, support, auspiciousness"],
  ["Nagas (serpents)", "coiled serpent", "Rakshasa", "penetrating intuition and intensity"],
  ["Pitris (ancestors)", "royal throne", "Rakshasa", "authority, lineage, dignified tradition"],
  ["Bhaga", "front legs of a couch", "Manushya", "pleasure, ease, creative enjoyment"],
  ["Aryaman", "back legs of a couch", "Manushya", "reliability, generosity, steady service"],
  ["Savitr (Surya)", "open hand / palm", "Deva", "skill, dexterity, resourcefulness"],
  ["Tvashtar", "bright pearl / jewel", "Rakshasa", "craftsmanship, brilliance, design sense"],
  ["Vayu", "coral / young shoot", "Deva", "independence, adaptability, balance-seeking"],
  ["Indra-Agni", "triumphal arch", "Rakshasa", "ambition, focus, goal-directed resolve"],
  ["Mitra", "lotus / staff", "Deva", "friendship, devotion, cooperation"],
  ["Indra", "earring / umbrella", "Rakshasa", "seniority, courage, protectiveness"],
  ["Nirriti", "bunch of roots", "Rakshasa", "inquiry into roots, dismantling, intensity"],
  ["Apas (waters)", "winnowing fan", "Manushya", "invigoration, conviction, influence"],
  ["Vishvadevas", "elephant tusk / planks", "Manushya", "perseverance, integrity, leadership"],
  ["Vishnu", "ear / three footprints", "Deva", "listening, learning, connection"],
  ["Vasus", "drum / flute", "Rakshasa", "rhythm, prosperity, ambition"],
  ["Varuna", "empty circle / 100 healers", "Rakshasa", "healing, secrecy, independence"],
  ["Aja Ekapada", "two-faced figure", "Manushya", "idealism, intensity, transformation"],
  ["Ahir Budhnya", "serpent of the deep", "Manushya", "depth, patience, contemplative wisdom"],
  ["Pushan", "fish / drum", "Deva", "nourishment, completion, compassion"],
];

// --- dignity (Section 9C.3): exalt (sign, peak deg), debilitation sign, own signs -----------
const DIGNITY = {
  sun:     { exalt: [0, 10], debil: 6, own: [4] },
  moon:    { exalt: [1, 3],  debil: 7, own: [3] },
  mars:    { exalt: [9, 28], debil: 3, own: [0, 7] },
  mercury: { exalt: [5, 15], debil: 11, own: [2, 5] },
  jupiter: { exalt: [3, 5],  debil: 9, own: [8, 11] },
  venus:   { exalt: [11, 27], debil: 5, own: [1, 6] },
  saturn:  { exalt: [6, 20], debil: 0, own: [9, 10] },
};
const _COMBUST_ORB = { moon: 12.0 };     // all others 8 deg; Sun itself never combust

// --- bhava significations (Section 9C.4) ---------------------------------------------------
const BHAVA = [
  ["Tanu", "self, body, temperament"],
  ["Dhana", "wealth, speech, family"],
  ["Sahaja", "siblings, courage, skills"],
  ["Sukha", "home, mother, comfort, education"],
  ["Putra", "children, creativity, intellect"],
  ["Ripu", "obstacles, health challenges, service"],
  ["Kalatra", "marriage, partnerships"],
  ["Ayur", "longevity, transformation, the hidden"],
  ["Dharma", "fortune, father, higher learning"],
  ["Karma", "career, status, public life"],
  ["Labha", "gains, income, friendships"],
  ["Vyaya", "expenditure, distant lands, rest, moksha"],
];
// Flavor a graha lends to whichever bhava it occupies (Section 9C.4).
const GRAHA_IN_BHAVA_TONE = {
  sun: "vitality, authority and a wish to shine",
  moon: "emotional sensitivity and changefulness",
  mars: "drive, energy and a competitive edge",
  mercury: "intellect, communication and adaptability",
  jupiter: "wisdom, expansion and good counsel",
  venus: "harmony, relationship and refinement",
  saturn: "discipline, patience and hard-earned results",
  rahu: "amplification, ambition and unconventional pulls",
  ketu: "detachment, introspection and a spiritual undertone",
};

// --- upayas (Section 9C.6): traditionally associated reference only ------------------------
const UPAYA = {
  sun: ["ruby", "Sunday", "Surya / Aditya Hridayam"],
  moon: ["pearl", "Monday", "Shiva"],
  mars: ["red coral", "Tuesday", "Subrahmanya / Hanuman"],
  mercury: ["emerald", "Wednesday", "Vishnu"],
  jupiter: ["yellow sapphire", "Thursday", "Dakshinamurthy"],
  venus: ["diamond", "Friday", "Lakshmi"],
  saturn: ["blue sapphire", "Saturday", "Shani / Hanuman"],
  rahu: ["hessonite", "—", "Durga"],
  ketu: ["cat's eye", "—", "Ganesha"],
};

const _CLASSICAL = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"];


function _bhava_of(rashi, lagna_rashi) {
  // Whole-sign bhava number (1..12) of a rashi, counted from the lagna rashi.
  return ((((rashi - lagna_rashi) % 12) + 12) % 12) + 1;
}

function _ang_sep(a, b) {
  const d = Math.abs(a - b) % 360.0;
  return Math.min(d, 360.0 - d);
}

function _dignity_of(gid, rashi, deg_in_rashi) {
  // Exalted / Own sign / Debilitated / Neutral, with peak-degree closeness when exalted.
  if (!(gid in DIGNITY)) return { status: "—", label: "variant traditions" };
  const d = DIGNITY[gid];
  if (rashi === d.exalt[0]) {
    const near = Math.abs(deg_in_rashi - d.exalt[1]) <= 3.0;
    return { status: "exalted", label: "exalted" + (near ? " (near peak)" : "") };
  }
  if (rashi === d.debil) return { status: "debilitated", label: "debilitated" };
  if (d.own.includes(rashi)) return { status: "own", label: "own sign" };
  return { status: "neutral", label: "neutral" };
}

function _neecha_bhanga(gid, by_rashi) {
  // Debilitated graha whose dispositor (lord of the debilitation sign) is itself exalted or
  // in its own sign -> classical cancellation indicated (a v1 subset of the full rule).
  const d = DIGNITY[gid];
  const dispositor = RASHI_LORD[d.debil];
  const disp_rashi = by_rashi[dispositor];
  if (disp_rashi === undefined || !(dispositor in DIGNITY)) return false;
  const dd = DIGNITY[dispositor];
  return disp_rashi === dd.exalt[0] || dd.own.includes(disp_rashi);
}

export function interpret(grahas, lagna, current_dasha, gochara_rashis) {
  // Build the six interpretation pillars. `grahas` are the Section 9B graha dicts, `lagna`
  // the lagna dict, `current_dasha` {maha, antar, maha_ends}, and `gochara_rashis` maps each
  // graha id -> its CURRENT (transit) rashi index.
  const g_by_id = {};
  const by_rashi = {};
  for (const g of grahas) { g_by_id[g.id] = g; by_rashi[g.id] = g.rashi; }
  const lagna_rashi = lagna.rashi;
  const sun_lon = g_by_id["sun"].lon;
  const moon = g_by_id["moon"];

  return {
    disclaimer: DISCLAIMER,
    temperament: _pillar_temperament(lagna, by_rashi, g_by_id),
    mind: _pillar_mind(moon, lagna_rashi),
    dignities: _pillar_dignities(grahas, g_by_id, by_rashi, sun_lon),
    bhavas: _pillar_bhavas(grahas, lagna_rashi, by_rashi, g_by_id),
    timing: _pillar_timing(current_dasha, g_by_id, by_rashi, lagna_rashi,
      moon.rashi, gochara_rashis),
    upayas: _pillar_upayas(grahas, g_by_id, by_rashi, sun_lon, current_dasha,
      moon.rashi, gochara_rashis),
  };
}

function _pillar_temperament(lagna, by_rashi, g_by_id) {
  const r = lagna.rashi;
  const lord = RASHI_LORD[r];
  const lord_rashi = lord in by_rashi ? by_rashi[lord] : r;
  const lord_bhava = _bhava_of(lord_rashi, r);
  const element = _ELEMENT[r % 4];
  const modality = _MODALITY[r % 3];
  const text = `With ${RASHI[r]} rising, the core temperament is classically described as `
    + `${RASHI_KEYWORDS[r]} — a sign of the ${element} element in ${modality} mode. `
    + `Its lord ${GRAHA_NAME[lord]} sits in ${RASHI[lord_rashi]} `
    + `(the ${_ordinal(lord_bhava)} bhava), which colours how that nature is expressed.`;
  return { lagna_rashi: RASHI[r], element, modality,
    lord: GRAHA_NAME[lord], lord_rashi: RASHI[lord_rashi], lord_bhava,
    keywords: RASHI_KEYWORDS[r], text };
}

function _pillar_mind(moon, lagna_rashi) {
  const r = moon.rashi;
  const nak_index = Math.floor(moon.lon / (360.0 / 27.0));
  const [deity, symbol, gana, kw] = NAKSHATRA_PROFILE[nak_index];
  const bhava = _bhava_of(r, lagna_rashi);
  const text = `The Moon in ${RASHI[r]} classically signifies an emotional nature that is `
    + `${RASHI_KEYWORDS[r]}. Born under ${moon.nakshatra} (deity ${deity}, symbol `
    + `${symbol}, ${gana} gana), the mind is traditionally associated with ${kw}. `
    + `The Moon occupies the ${_ordinal(bhava)} bhava from the lagna.`;
  return { chandra_rashi: RASHI[r], nakshatra: moon.nakshatra, pada: moon.pada,
    deity, symbol, gana, keywords: kw, moon_bhava: bhava, text };
}

function _pillar_dignities(grahas, g_by_id, by_rashi, sun_lon) {
  const chips = [], rows = [];
  for (const g of grahas) {
    const gid = g.id;
    const dig = _dignity_of(gid, g.rashi, g.deg_in_rashi);
    const bhanga = dig.status === "debilitated" && _neecha_bhanga(gid, by_rashi);
    let combust = false;
    if (gid !== "sun" && gid !== "rahu" && gid !== "ketu") {
      const orb = gid in _COMBUST_ORB ? _COMBUST_ORB[gid] : 8.0;
      combust = _ang_sep(g.lon, sun_lon) < orb;
    }
    const flags = [];
    if (dig.status === "exalted") {
      chips.push(`${GRAHA_NAME[gid]} ↑ exalted`);
      flags.push(dig.label);
    } else if (dig.status === "debilitated") {
      chips.push(`${GRAHA_NAME[gid]} ↓ debilitated` + (bhanga ? " (bhanga)" : ""));
      flags.push("debilitated" + (bhanga ? " — cancellation (neecha-bhanga) indicated" : ""));
    } else if (dig.status === "own") {
      chips.push(`${GRAHA_NAME[gid]} • own sign`);
      flags.push("own sign");
    }
    if (combust) {
      chips.push(`${GRAHA_NAME[gid]} combust`);
      flags.push("combust (close to the Sun)");
    }
    rows.push({ graha: GRAHA_NAME[gid], rashi: g.rashi_name,
      dignity: dig.label, bhanga, combust,
      notes: flags.join("; ") || "neutral" });
  }
  const note = "Dignity reflects exaltation / own-sign / debilitation only; the full friend-enemy "
    + "(maitri) matrix is deliberately omitted in this version.";
  return { chips, rows, note };
}

function _pillar_bhavas(grahas, lagna_rashi, by_rashi, g_by_id) {
  const occupants = {};
  for (let n = 1; n <= 12; n++) occupants[n] = [];
  for (const g of grahas) occupants[_bhava_of(g.rashi, lagna_rashi)].push(g.id);
  const rows = [];
  for (let n = 1; n <= 12; n++) {
    const rashi = (((lagna_rashi + n - 1) % 12) + 12) % 12;
    const [name, sig] = BHAVA[n - 1];
    const lord = RASHI_LORD[rashi];
    const lord_rashi = lord in by_rashi ? by_rashi[lord] : rashi;
    const occ = occupants[n];
    let sentence = "";
    if (occ.length) {
      const tones = occ.map((o) => GRAHA_IN_BHAVA_TONE[o]).join(", ");
      const names = occ.map((o) => GRAHA_NAME[o]).join(" & ");
      sentence = `${names} in the ${_ordinal(n)} (${name}) brings ${tones} to matters of `
        + `${sig}.`;
    }
    rows.push({ bhava: n, name, significations: sig,
      rashi: RASHI[rashi], occupants: occ.map((o) => GRAHA_NAME[o]),
      lord: GRAHA_NAME[lord], lord_rashi: RASHI[lord_rashi],
      lord_bhava: _bhava_of(lord_rashi, lagna_rashi), sentence });
  }
  return { system: "whole-sign houses", rows };
}

function _rules_bhavas(gid, lagna_rashi) {
  // Bhavas (1..12) ruled by a graha = houses whose rashi lord is that graha.
  const out = [];
  for (let r = 0; r < 12; r++) if (RASHI_LORD[r] === gid) out.push(_bhava_of(r, lagna_rashi));
  return out;
}

function _pillar_timing(current_dasha, g_by_id, by_rashi, lagna_rashi, moon_rashi, gochara_rashis) {
  // Dasha paragraph: current maha/antar lords, their natal dignity + bhavas ruled/occupied.
  let paragraph = "The 120-year Vimshottari cycle from birth has completed, so no current "
    + "maha-dasha lord applies.";
  const maha = (current_dasha || {}).maha;
  if (maha) {
    const lord = maha.toLowerCase();
    const parts = [];
    const roles = [["maha (major)", lord], ["antar (sub)", ((current_dasha.antar) || "").toLowerCase()]];
    for (const [role, gid] of roles) {
      if (!(gid in g_by_id)) continue;
      const g = g_by_id[gid];
      const dig = _dignity_of(gid, g.rashi, g.deg_in_rashi).label;
      const ruled = _rules_bhavas(gid, lagna_rashi);
      const occ = _bhava_of(g.rashi, lagna_rashi);
      const ruled_s = ruled.length ? ruled.map((b) => _ordinal(b)).join(", ") : "—";
      parts.push(`the ${role} lord ${GRAHA_NAME[gid]} is ${dig} in ${g.rashi_name} `
        + `(occupying the ${_ordinal(occ)} bhava, ruling the ${ruled_s})`);
    }
    paragraph = "The current period runs under " + parts.join("; ") + ". Classically, the "
      + "themes of those bhavas are emphasised during this period.";
  }

  // Gochara: each graha's house counted from the natal Chandra rashi (South-Indian convention).
  const rows = [], headlines = [];
  for (const gid of [..._CLASSICAL, "rahu", "ketu"]) {
    const tr = gochara_rashis[gid];
    if (tr === undefined) continue;
    const house = ((((tr - moon_rashi) % 12) + 12) % 12) + 1;
    rows.push({ graha: GRAHA_NAME[gid], transit_rashi: RASHI[tr], house_from_moon: house });
  }

  const sat_house = "saturn" in gochara_rashis
    ? ((((gochara_rashis["saturn"] - moon_rashi) % 12) + 12) % 12) + 1 : null;
  if (sat_house === 12 || sat_house === 1 || sat_house === 2) {
    const phase = { 12: "rising (first phase)", 1: "peak (second phase)", 2: "setting (third phase)" }[sat_house];
    headlines.push({ name: "Sade Sati", active: true,
      text: `Saturn transits the ${_ordinal(sat_house)} from the natal Moon — `
        + `Sade Sati is indicated, ${phase}.` });
  } else {
    headlines.push({ name: "Sade Sati", active: false,
      text: "Saturn is not in the 12th, 1st or 2nd from the natal Moon — "
        + "Sade Sati is not indicated at present." });
  }
  if ("jupiter" in gochara_rashis) {
    const jh = ((((gochara_rashis["jupiter"] - moon_rashi) % 12) + 12) % 12) + 1;
    const fav = [2, 5, 7, 9, 11].includes(jh);
    headlines.push({ name: "Jupiter gochara", active: fav,
      text: `Jupiter transits the ${_ordinal(jh)} from the Moon — `
        + `${fav ? "classically favourable" : "a quieter placement"}.` });
  }
  if ("saturn" in gochara_rashis) {
    const fav = [3, 6, 11].includes(sat_house);
    headlines.push({ name: "Saturn gochara", active: fav,
      text: `Saturn transits the ${_ordinal(sat_house)} from the Moon — `
        + `${fav ? "a classically supportive placement" : "calls for patience"}.` });
  }
  if ("rahu" in gochara_rashis && "ketu" in gochara_rashis) {
    const rh = ((((gochara_rashis["rahu"] - moon_rashi) % 12) + 12) % 12) + 1;
    const kh = ((((gochara_rashis["ketu"] - moon_rashi) % 12) + 12) % 12) + 1;
    headlines.push({ name: "Rahu–Ketu axis", active: false,
      text: `The Rahu–Ketu axis falls across the ${_ordinal(rh)}/${_ordinal(kh)} `
        + `houses from the Moon.` });
  }
  return { dasha_paragraph: paragraph, gochara_rows: rows, headlines };
}

function _pillar_upayas(grahas, g_by_id, by_rashi, sun_lon, current_dasha, moon_rashi, gochara_rashis) {
  // List upayas only for flagged grahas (debilitated / combust / current dasha lord /
  // Sade Sati), plus the full reference behind a show-all expander -- reference only.
  const flagged = {};
  const add = (gid, reason) => {
    if (!(gid in flagged)) flagged[gid] = new Set();
    flagged[gid].add(reason);
  };

  for (const g of grahas) {
    const gid = g.id;
    const dig = _dignity_of(gid, g.rashi, g.deg_in_rashi);
    if (dig.status === "debilitated") add(gid, "debilitated");
    if (gid !== "sun" && gid !== "rahu" && gid !== "ketu") {
      const orb = gid in _COMBUST_ORB ? _COMBUST_ORB[gid] : 8.0;
      if (_ang_sep(g.lon, sun_lon) < orb) add(gid, "combust");
    }
  }
  for (const role of ["maha", "antar"]) {
    const nm = (current_dasha || {})[role];
    if (nm) add(nm.toLowerCase(), `current ${role}-dasha lord`);
  }
  if ("saturn" in gochara_rashis) {
    const sh = ((((gochara_rashis["saturn"] - moon_rashi) % 12) + 12) % 12) + 1;
    if (sh === 12 || sh === 1 || sh === 2) add("saturn", "Sade Sati transit");
  }

  const entry = (gid, reasons) => {
    const [gem, vara, deity] = UPAYA[gid];
    return { graha: GRAHA_NAME[gid], gemstone: gem, vara, deity,
      reasons: reasons ? [...reasons].sort() : [],
      text: `${GRAHA_NAME[gid]} is traditionally associated with the ${gem} `
        + `(vara ${vara}, deity ${deity}).` };
  };

  return {
    disclaimer: "Traditional reference only — listed for grahas the chart flags. "
      + "Presented as customs associated with each graha, not a prescription.",
    flagged: Object.entries(flagged).map(([gid, r]) => entry(gid, r)),
    all: [..._CLASSICAL, "rahu", "ketu"].map((gid) => entry(gid)),
  };
}

const _ORD = { 1: "1st", 2: "2nd", 3: "3rd", 21: "21st", 22: "22nd", 23: "23rd" };

function _ordinal(n) {
  return n in _ORD ? _ORD[n] : `${n}th`;
}
