// Sanskrit name tables.
// IAST-lite spellings are the contract; do NOT "correct" them.

export const TITHI = [
  "Pratipada", "Dwitiya", "Tritiya", "Chaturthi", "Panchami", "Shashthi", "Saptami",
  "Ashtami", "Navami", "Dashami", "Ekadashi", "Dwadashi", "Trayodashi", "Chaturdashi",
  "Purnima",
  "Pratipada", "Dwitiya", "Tritiya", "Chaturthi", "Panchami", "Shashthi", "Saptami",
  "Ashtami", "Navami", "Dashami", "Ekadashi", "Dwadashi", "Trayodashi", "Chaturdashi",
  "Amavasya",
];

export const NAKSHATRA = [
  "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra", "Punarvasu",
  "Pushya", "Ashlesha", "Magha", "Purva Phalguni", "Uttara Phalguni", "Hasta", "Chitra", "Swati",
  "Vishakha", "Anuradha", "Jyeshtha", "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana",
  "Dhanishta", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati",
];

export const YOGA = [
  "Vishkambha", "Priti", "Ayushman", "Saubhagya", "Shobhana", "Atiganda", "Sukarman",
  "Dhriti", "Shula", "Ganda", "Vriddhi", "Dhruva", "Vyaghata", "Harshana", "Vajra", "Siddhi",
  "Vyatipata", "Variyan", "Parigha", "Shiva", "Siddha", "Sadhya", "Shubha", "Shukla", "Brahma",
  "Indra", "Vaidhriti",
];

export const KARANA_MOVABLE = ["Bava", "Balava", "Kaulava", "Taitila", "Gara", "Vanija", "Vishti"];

export const MASA = [
  "Chaitra", "Vaishakha", "Jyeshtha", "Ashadha", "Shravana", "Bhadrapada", "Ashwina",
  "Kartika", "Margashirsha", "Pausha", "Magha", "Phalguna",
];

// VARA[0] is SUNDAY.
export const VARA = ["Ravivara", "Somavara", "Mangalavara", "Budhavara", "Guruvara", "Shukravara", "Shanivara"];
export const VARA_ENGLISH = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const RASHI = [
  "Mesha", "Vrishabha", "Mithuna", "Karka", "Simha", "Kanya", "Tula", "Vrischika",
  "Dhanu", "Makara", "Kumbha", "Meena",
];

export const SAMVATSARA = [
  "Prabhava", "Vibhava", "Shukla", "Pramoda", "Prajapati", "Angirasa", "Shrimukha",
  "Bhava", "Yuva", "Dhata", "Ishvara", "Bahudhanya", "Pramathi", "Vikrama", "Vrisha",
  "Chitrabhanu", "Svabhanu", "Tarana", "Parthiva", "Vyaya", "Sarvajit", "Sarvadhari", "Virodhi",
  "Vikriti", "Khara", "Nandana", "Vijaya", "Jaya", "Manmatha", "Durmukhi", "Hevilambi", "Vilambi",
  "Vikari", "Sharvari", "Plava", "Shubhakrit", "Shobhakrit", "Krodhi", "Vishvavasu", "Parabhava",
  "Plavanga", "Kilaka", "Saumya", "Sadharana", "Virodhikrit", "Paridhavi", "Pramadicha",
  "Ananda", "Rakshasa", "Nala", "Pingala", "Kalayukti", "Siddharthi", "Raudra", "Durmati",
  "Dundubhi", "Rudhirodgari", "Raktakshi", "Krodhana", "Akshaya",
];

// Karana name for index k in 0..59.
export function karanaName(k) {
  if (k === 0) return "Kimstughna";
  if (k >= 1 && k <= 56) return KARANA_MOVABLE[(k - 1) % 7];
  return { 57: "Shakuni", 58: "Chatushpada", 59: "Naga" }[k];
}
