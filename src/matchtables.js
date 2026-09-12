// Ashtakoota (36-guna) scoring tables (Section C.2) -- the contract. Ported line-faithfully
// from app/panchang/matchtables.py; do NOT re-derive or "correct" these values.
//
// All lookups key off 0-based indices: nakshatra 0-26 (order in names.js NAKSHATRA), rashi
// 0-11 (Mesha=0).

// --- C.2.1 Varna -----------------------------------------------------------------------------
export const VARNA_GROUPS = {
  Brahmin: [3, 7, 11],
  Kshatriya: [0, 4, 8],
  Vaishya: [1, 5, 9],
  Shudra: [2, 6, 10],
};
export const VARNA_RANK = { Brahmin: 4, Kshatriya: 3, Vaishya: 2, Shudra: 1 };

// --- C.2.2 Vashya (whole-sign v1 simplification -- see DEVIATIONS.md) ------------------------
export const VASHYA_GROUPS = {
  Chatushpada: [0, 1, 8],
  Manava: [2, 5, 6, 10],
  Jalachara: [3, 9, 11],
  Vanachara: [4],
  Keeta: [7],
};
export const VASHYA_ORDER = ["Chatushpada", "Manava", "Jalachara", "Vanachara", "Keeta"];
export const VASHYA_MATRIX = [
  [2, 1, 1, 0, 1],
  [1, 2, 0.5, 0, 1],
  [1, 0.5, 2, 1, 1],
  [1, 0, 1, 2, 0],
  [1, 1, 1, 0, 2],
];

// --- C.2.3 Tara ------------------------------------------------------------------------------
export const TARA_UNFAVOURABLE = new Set([3, 5, 7]);   // Vipat, Pratyari, Vadha

// --- C.2.4 Yoni -------------------------------------------------------------------------------
export const YONI_OF_NAKSHATRA = [
  "Ashva", "Gaja", "Mesha", "Sarpa", "Sarpa", "Shvana", "Marjara", "Mesha", "Marjara",
  "Mushaka", "Mushaka", "Gau", "Mahisha", "Vyaghra", "Mahisha", "Vyaghra", "Mriga", "Mriga",
  "Shvana", "Vanara", "Nakula", "Vanara", "Simha", "Ashva", "Simha", "Gau", "Gaja",
];
export const YONI_DISPLAY = {
  Ashva: "Ashva (horse)", Gaja: "Gaja (elephant)", Mesha: "Mesha (sheep)",
  Sarpa: "Sarpa (serpent)", Shvana: "Shvana (dog)", Marjara: "Marjara (cat)",
  Mushaka: "Mushaka (rat)", Gau: "Gau (cow)", Mahisha: "Mahisha (buffalo)",
  Vyaghra: "Vyaghra (tiger)", Mriga: "Mriga (deer)", Vanara: "Vanara (monkey)",
  Nakula: "Nakula (mongoose)", Simha: "Simha (lion)",
};
export const YONI_ORDER = ["Ashva", "Gaja", "Mesha", "Sarpa", "Shvana", "Marjara", "Mushaka",
  "Gau", "Mahisha", "Vyaghra", "Mriga", "Vanara", "Nakula", "Simha"];
export const YONI_MATRIX = [
  [4, 2, 2, 3, 2, 2, 2, 1, 0, 1, 3, 3, 2, 1],
  [2, 4, 3, 3, 2, 2, 2, 2, 3, 1, 2, 3, 2, 0],
  [2, 3, 4, 2, 1, 2, 1, 3, 3, 1, 2, 0, 3, 1],
  [3, 3, 2, 4, 2, 1, 1, 1, 1, 2, 2, 2, 0, 2],
  [2, 2, 1, 2, 4, 2, 1, 2, 2, 1, 0, 2, 1, 1],
  [2, 2, 2, 1, 2, 4, 0, 2, 2, 1, 3, 3, 2, 1],
  [2, 2, 1, 1, 1, 0, 4, 2, 2, 2, 2, 2, 1, 2],
  [1, 2, 3, 1, 2, 2, 2, 4, 3, 0, 3, 2, 2, 1],
  [0, 3, 3, 1, 2, 2, 2, 3, 4, 1, 2, 2, 2, 1],
  [1, 1, 1, 2, 1, 1, 2, 0, 1, 4, 1, 1, 2, 1],
  [3, 2, 2, 2, 0, 3, 2, 3, 2, 1, 4, 2, 2, 1],
  [3, 3, 0, 2, 2, 3, 2, 2, 2, 1, 2, 4, 3, 2],
  [2, 2, 3, 0, 1, 2, 1, 2, 2, 2, 2, 3, 4, 2],
  [1, 0, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 2, 4],
];

// --- C.2.5 Graha Maitri (permanent friendship; sun..saturn only) -----------------------------
export const GRAHA_MAITRI = {
  sun:     { friends: new Set(["moon", "mars", "jupiter"]), enemies: new Set(["venus", "saturn"]) },
  moon:    { friends: new Set(["sun", "mercury"]), enemies: new Set() },
  mars:    { friends: new Set(["sun", "moon", "jupiter"]), enemies: new Set(["mercury"]) },
  mercury: { friends: new Set(["sun", "venus"]), enemies: new Set(["moon"]) },
  jupiter: { friends: new Set(["sun", "moon", "mars"]), enemies: new Set(["mercury", "venus"]) },
  venus:   { friends: new Set(["mercury", "saturn"]), enemies: new Set(["sun", "moon"]) },
  saturn:  { friends: new Set(["mercury", "venus"]), enemies: new Set(["sun", "moon", "mars"]) },
};

// --- C.2.6 Gana -------------------------------------------------------------------------------
export const GANA_MATRIX = {
  Deva: { Deva: 6, Manushya: 6, Rakshasa: 0 },
  Manushya: { Deva: 5, Manushya: 6, Rakshasa: 0 },
  Rakshasa: { Deva: 1, Manushya: 0, Rakshasa: 6 },
};

// --- C.2.7 Bhakoot ----------------------------------------------------------------------------
export const BHAKOOT_DOSHA_SETS = [[2, 12], [5, 9], [6, 8]];

// --- C.2.8 Nadi -------------------------------------------------------------------------------
export const NADI_OF_NAKSHATRA_MOD6 = ["Adi", "Madhya", "Antya", "Antya", "Madhya", "Adi"];

// --- C.2.9 Mangal dosha ------------------------------------------------------------------------
export const MANGAL_DOSHA_HOUSES = new Set([1, 2, 4, 7, 8, 12]);
