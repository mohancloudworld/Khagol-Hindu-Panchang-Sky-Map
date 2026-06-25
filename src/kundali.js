// South-Indian Kundali chart (chart + birth panchang).
// Dasha (vimshottari) and the interpretation layer are deferred to a later module.
import * as swe from "./sweph.js";
import { tithi, yoga, karana, varaForWeekday } from "./panchang.js";
import { vimshottari, NAMES, YEARS } from "./dasha.js";
import { governingSunrise, ymdOfInstant, jdToDate, isoYMD } from "./suntime.js";
import { NAKSHATRA, RASHI } from "./names.js";

const GRAHAS = ["sun", "moon", "mars", "mercury", "jupiter", "saturn", "venus"];
const DISPLAY = { sun: "Surya", moon: "Chandra", mars: "Mangala", mercury: "Budha", jupiter: "Guru", venus: "Shukra", saturn: "Shani", rahu: "Rahu", ketu: "Ketu" };
const LABEL = { sun: "Su", moon: "Mo", mars: "Ma", mercury: "Bu", jupiter: "Gu", venus: "Sk", saturn: "Sa", rahu: "Ra", ketu: "Ke" };
const NAK_ARC = 360 / 27, PADA_ARC = NAK_ARC / 4;
// Lords of the 27 nakshatras (Vimshottari sequence repeats 3 times across 27).
const NAK_LORDS = [
  "Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury",   // 1-9
  "Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury",   // 10-18
  "Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury",   // 19-27
];

const JD_UNIX = 2440587.5;
function jdFromDate(dt) {
  const h = dt.getUTCHours() + dt.getUTCMinutes() / 60 + (dt.getUTCSeconds() + dt.getUTCMilliseconds() / 1000) / 3600;
  return swe.julday(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), h);
}
function nak(lon) {
  const n = Math.floor(lon / NAK_ARC), pada = Math.floor((lon % NAK_ARC) / PADA_ARC) + 1;
  return [NAKSHATRA[n], pada];
}
const navamsaRashi = (lon) => { const r = Math.floor(lon / 30); return (r * 9 + Math.floor((lon % 30) / (30 / 9))) % 12; };

function toDMS(deg) {
  const d = Math.floor(deg);
  const mFull = (deg - d) * 60;
  const m = Math.floor(mFull);
  const s = (mFull - m) * 60;
  return `${d}° ${String(m).padStart(2, "0")}' ${s.toFixed(4).padStart(7, "0")}"`;
}

function houseFromLagna(grahaRashi, lagnaRashi) {
  return ((grahaRashi - lagnaRashi + 12) % 12) + 1;
}

function grahaEntry(gid, lon, retro) {
  const rashi = Math.floor(lon / 30), [n, pada] = nak(lon);
  const nakIndex = Math.floor(lon / NAK_ARC);
  return {
    id: gid, name: DISPLAY[gid], label: LABEL[gid], lon: +lon.toFixed(6), rashi,
    rashi_name: RASHI[rashi], deg_in_rashi: +(lon % 30).toFixed(4), deg_dms: toDMS(lon % 30),
    nakshatra: n, pada, nakshatra_lord: NAK_LORDS[nakIndex],
    retrograde: retro, navamsa_rashi: navamsaRashi(lon),
  };
}

// Governing sunrise weekday (Sun=0): the solar day containing the birth instant (sunrise.py).
function governingWeekday(dtUTC, lat, lon, zone) {
  const g = governingSunrise(lat, lon, dtUTC, zone).gov || dtUTC;
  const ld = ymdOfInstant(g, zone);
  return new Date(Date.UTC(ld.y, ld.mo - 1, ld.d)).getUTCDay();
}

export function computeKundali(dtUTC, lat, lon, { node = "mean", ayanamsa = "lahiri", zone = "UTC", now = new Date() } = {}) {
  const jd = jdFromDate(dtUTC);
  const nodeBody = node === "true" ? "true_node" : "mean_node";

  const grahas = [];
  for (const gid of GRAHAS) {
    const glon = swe.longitude(jd, gid, ayanamsa), gsp = swe.speed(jd, gid, ayanamsa);
    grahas.push(grahaEntry(gid, glon, gsp < 0 && gid !== "sun" && gid !== "moon"));
  }
  const rahuLon = swe.longitude(jd, nodeBody, ayanamsa);
  grahas.push(grahaEntry("rahu", rahuLon, true));
  grahas.push(grahaEntry("ketu", (rahuLon + 180) % 360, true));

  const lagnaLon = swe.lagna(jd, lat, lon, ayanamsa), lagnaRashi = Math.floor(lagnaLon / 30);
  const lagna = {
    lon: +lagnaLon.toFixed(6), rashi: lagnaRashi, rashi_name: RASHI[lagnaRashi],
    deg_in_rashi: +(lagnaLon % 30).toFixed(4), deg_dms: toDMS(lagnaLon % 30),
    nakshatra: nak(lagnaLon)[0], pada: nak(lagnaLon)[1], nakshatra_lord: NAK_LORDS[Math.floor(lagnaLon / NAK_ARC)],
    navamsa_rashi: navamsaRashi(lagnaLon),
  };

  const rasi_chart = {}, navamsa_chart = {};
  for (let i = 0; i < 12; i++) { rasi_chart[i] = []; navamsa_chart[i] = []; }
  rasi_chart[lagnaRashi].push("La");
  navamsa_chart[lagna.navamsa_rashi].push("La");
  for (const g of grahas) { rasi_chart[g.rashi].push(g.label); navamsa_chart[g.navamsa_rashi].push(g.label); }

  const moon = grahas.find((g) => g.id === "moon"), sun = grahas.find((g) => g.id === "sun");
  const vara = varaForWeekday(governingWeekday(dtUTC, lat, lon, zone));
  const _tithi = tithi(jd, ayanamsa), _yoga = yoga(jd, ayanamsa), _karana = karana(jd, ayanamsa);
  const birth_panchang = {
    tithi: _tithi.display, vara: `${vara.name} (${vara.english})`,
    yoga: _yoga.name, karana: _karana.name,
    tithi_only: _tithi.name, paksha: _tithi.paksha,
    janma_nakshatra: moon.nakshatra, pada: moon.pada,
    chandra_rashi: moon.rashi_name, surya_rashi: sun.rashi_name,
  };

  const d = vimshottari(moon.lon, dtUTC, now, zone);
  // Flatten maha/antar matrix in the same row-major order as the PDF (9 rows x 9 antar columns).
  // Each row is a maha dasha; each column is the start date of an antar dasha within that maha,
  // beginning with the maha lord and following the Vimshottari sequence.
  const addYears = (dt, y) => new Date(dt.getTime() + y * 365.25 * 86400000);
  const fmt = (date) => isoYMD(ymdOfInstant(date, zone));
  const dashaMatrix = d.dashas.slice(0, 9).map((maha) => {
    const full = YEARS[maha.lord];
    const notionalStart = addYears(new Date(maha.end + "T00:00:00"), -full);
    const startIdx = NAMES.indexOf(maha.lord);
    let cur = notionalStart;
    const antar = [];
    for (let k = 0; k < 9; k++) {
      const al = NAMES[(startIdx + k) % 9];
      const seg = full * YEARS[al] / 120;
      const s = cur;
      cur = addYears(cur, seg);
      antar.push({ lord: al, start: fmt(s), end: fmt(cur) });
    }
    return { lord: maha.lord, start: maha.start, end: maha.end, antar };
  });

  // Summary table rows: Ascendant + 9 grahas, with house number relative to lagna.
  const summaryRows = [
    {
      id: "lagna", name: "Ascendant", label: "La", rashi_name: lagna.rashi_name,
      house: 1, deg_dms: lagna.deg_dms, nakshatra: lagna.nakshatra, pada: lagna.pada,
      nakshatra_lord: lagna.nakshatra_lord, retrograde: false,
    },
    ...grahas.map((g) => ({
      id: g.id, name: g.name, label: g.label, rashi_name: g.rashi_name,
      house: houseFromLagna(g.rashi, lagnaRashi),
      deg_dms: g.deg_dms, nakshatra: g.nakshatra, pada: g.pada,
      nakshatra_lord: g.nakshatra_lord, retrograde: g.retrograde,
    })),
  ];

  return {
    lagna, grahas, rasi_chart, navamsa_chart, birth_panchang,
    dashas: d.dashas, current_dasha: d.current_dasha,
    dasha_summary: { janma_lord: d.janma_lord, balance_years: d.balance_years },
    ayanamsa, node,
    summary: {
      tithi: `${_tithi.paksha} ${_tithi.name}`,
      karana: _karana.name,
      yoga: _yoga.name,
      rows: summaryRows,
      dashaMatrix,
      ayanamsa_dms: toDMS(swe.ayanamsaDeg(jd, ayanamsa)),
    },
  };
}
