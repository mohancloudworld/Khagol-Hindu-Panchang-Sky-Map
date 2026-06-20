// i18n.js -- client localization (Phase 9D.2). Fetches a per-language bundle from
// /api/i18n/<lang> and swaps backend-provided anga/graha names token-by-token. Sky-map object
// names (IAU stars/planets) stay English by design.

let bundle = { lang: "en", names: {}, ui: {} };
const cache = { en: bundle };

// Load (and cache) a language bundle; English needs no fetch.
export async function loadLang(lang) {
  // Extension v1: English + Hindu (Latin transliteration) only -- no script bundles to fetch.
  bundle = cache.en;
  return bundle;
}

// Translate a name string: replace each English word-run with its localized form (leaves
// punctuation, digits and already-localized glyphs untouched). No-op in English.
export function tr(text) {
  if (text == null || bundle.lang === "en") return text;
  return String(text).replace(/[A-Za-z]+/g, (w) => bundle.names[w] || w);
}

// A UI chrome label by key, with an English fallback.
export function label(key, fallback) {
  return (bundle.ui && bundle.ui[key]) || fallback || key;
}

export function lang() { return bundle.lang; }

// --- Hindu names for sky-map objects ---------------------------------------------------------
// English IAU name -> Hindu-name token. Grahas (Sun..Saturn) and the principal (yogatara) star
// of each nakshatra -- which in everyday usage IS that star's Hindu name (Spica = Chitra). The
// token is localized through tr(); objects absent here have no Hindu name and stay English.
export const GRAHA = {
  Sun: "Surya", Moon: "Chandra", Mercury: "Budha", Venus: "Shukra",
  Mars: "Mangala", Jupiter: "Guru", Saturn: "Shani",
};
export const NAKSHATRA_STAR = {
  Sheratan: "Ashwini", Bharani: "Bharani", Alcyone: "Krittika", Aldebaran: "Rohini",
  Meissa: "Mrigashira", Betelgeuse: "Ardra", Pollux: "Punarvasu", Castor: "Punarvasu",
  "Asellus Australis": "Pushya", Ashlesha: "Ashlesha", Regulus: "Magha", Zosma: "Purva Phalguni",
  Denebola: "Uttara Phalguni", Algorab: "Hasta", Spica: "Chitra", Arcturus: "Swati",
  Zubenelgenubi: "Vishakha", Dschubba: "Anuradha", Antares: "Jyeshtha", Shaula: "Mula",
  "Kaus Media": "Purva Ashadha", Nunki: "Uttara Ashadha", Altair: "Shravana",
  Rotanev: "Dhanishta", Sadachbia: "Shatabhisha", Markab: "Purva Bhadrapada",
  Algenib: "Uttara Bhadrapada", Revati: "Revati", Vega: "Abhijit",
};
// Other objects that aren't grahas or nakshatras but still have a celestial Hindu name: Earth
// (the geocentric observer, not a graha), the outer planets (modern Sanskrit convention), and
// the well-known named stars -- Dhruva (Pole Star), Agastya (Canopus), Mrigavyadha (Sirius),
// Arundhati (Alcor) and the seven Saptarishi of Ursa Major (a common rishi->star assignment).
export const OTHER_BODY = {
  Earth: "Prithvi", Uranus: "Aruna", Neptune: "Varuna", Pluto: "Yama",
  Polaris: "Dhruva", Canopus: "Agastya", Sirius: "Mrigavyadha", Alcor: "Arundhati",
  Dubhe: "Kratu", Merak: "Pulaha", Phecda: "Pulastya", Megrez: "Atri",
  Alioth: "Angiras", Mizar: "Vasishtha", Alkaid: "Marichi", Capella: "Brahmahridaya",
};

// The Hindu-name token for an object, or null. (Used by the info card for its Hindu-name row.)
export function hinduToken(name) {
  if (!name) return null;
  return GRAHA[name] || NAKSHATRA_STAR[name] || OTHER_BODY[name] || null;
}

// Shared default-label policy for sky-map STARS, used by all three views so they stay consistent.
// A star is labeled iff it is relevant to Hindu astrology (has a Hindu name). `eclLatDeg` is the
// star's ecliptic latitude (astro.eclipticLatitude); within ZODIAC_LAT_DEG it is an "on-ecliptic"
// nakshatra star that the Rashi band tints gold. Returns null (don't label) or { zodiac }.
export const ZODIAC_LAT_DEG = 20;
export function starLabelInfo(name, eclLatDeg) {
  if (!name || !hinduToken(name)) return null;
  return { zodiac: Math.abs(eclLatDeg) <= ZODIAC_LAT_DEG };
}

// Reverse map: Hindu name (transliteration, lowercased) -> English IAU name, so search accepts
// e.g. "Chandra" or "Chitra". First mapping wins where a name is shared (Punarvasu -> Pollux).
const HINDU_TO_ENGLISH = {};
for (const [en, tok] of Object.entries({ ...GRAHA, ...NAKSHATRA_STAR, ...OTHER_BODY })) {
  const k = tok.toLowerCase();
  if (!(k in HINDU_TO_ENGLISH)) HINDU_TO_ENGLISH[k] = en;
}
export function englishForHindu(name) {
  return name ? (HINDU_TO_ENGLISH[String(name).trim().toLowerCase()] || null) : null;
}
// Every Hindu name token (for the search datalist, so the typed Hindu name autocompletes).
export function hinduNames() {
  return [...new Set([...Object.values(GRAHA), ...Object.values(NAKSHATRA_STAR), ...Object.values(OTHER_BODY)])];
}

// Name mode for sky-map objects: "english" = IAU names; "hindu" = graha/nakshatra names,
// rendered in the currently-loaded language (English script = the transliterated token).
let nameMode = "hindu";   // default: show graha/nakshatra Hindu names (settings can switch to English)
export function setNameMode(m) { nameMode = m === "hindu" ? "hindu" : "english"; }
export function getNameMode() { return nameMode; }

// Display name for a sky object. English mode -> the IAU name. Hindu mode -> the Hindu name
// localized to the current language (en bundle leaves the token as transliteration, e.g.
// "Surya"); objects with no Hindu name keep their IAU name in either mode.
export function objectName(name) {
  if (!name || nameMode === "english") return name;
  const tok = hinduToken(name);
  return tok ? tr(tok) : name;
}
