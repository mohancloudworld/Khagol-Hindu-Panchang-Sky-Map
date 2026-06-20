// South-Indian Kundali chart (chart + birth panchang).
// Dasha (vimshottari) and the interpretation layer are deferred to a later module.
import * as swe from "./sweph.js";
import { tithi, yoga, karana, varaForWeekday } from "./panchang.js";
import { vimshottari } from "./dasha.js";
import { governingSunrise, ymdOfInstant, jdToDate } from "./suntime.js";
import { NAKSHATRA, RASHI } from "./names.js";

const GRAHAS = ["sun", "moon", "mars", "mercury", "jupiter", "saturn", "venus"];
const DISPLAY = { sun: "Surya", moon: "Chandra", mars: "Mangala", mercury: "Budha", jupiter: "Guru", venus: "Shukra", saturn: "Shani", rahu: "Rahu", ketu: "Ketu" };
const LABEL = { sun: "Su", moon: "Mo", mars: "Ma", mercury: "Bu", jupiter: "Gu", venus: "Sk", saturn: "Sa", rahu: "Ra", ketu: "Ke" };
const NAK_ARC = 360 / 27, PADA_ARC = NAK_ARC / 4;

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

function grahaEntry(gid, lon, retro) {
  const rashi = Math.floor(lon / 30), [n, pada] = nak(lon);
  return { id: gid, name: DISPLAY[gid], label: LABEL[gid], lon: +lon.toFixed(4), rashi,
    rashi_name: RASHI[rashi], deg_in_rashi: +(lon % 30).toFixed(2), nakshatra: n, pada,
    retrograde: retro, navamsa_rashi: navamsaRashi(lon) };
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
  const lagna = { lon: +lagnaLon.toFixed(4), rashi: lagnaRashi, rashi_name: RASHI[lagnaRashi], navamsa_rashi: navamsaRashi(lagnaLon) };

  const rasi_chart = {}, navamsa_chart = {};
  for (let i = 0; i < 12; i++) { rasi_chart[i] = []; navamsa_chart[i] = []; }
  rasi_chart[lagnaRashi].push("La");
  navamsa_chart[lagna.navamsa_rashi].push("La");
  for (const g of grahas) { rasi_chart[g.rashi].push(g.label); navamsa_chart[g.navamsa_rashi].push(g.label); }

  const moon = grahas.find((g) => g.id === "moon"), sun = grahas.find((g) => g.id === "sun");
  const vara = varaForWeekday(governingWeekday(dtUTC, lat, lon, zone));
  const birth_panchang = {
    tithi: tithi(jd, ayanamsa).display, vara: `${vara.name} (${vara.english})`,
    yoga: yoga(jd, ayanamsa).name, karana: karana(jd, ayanamsa).name,
    janma_nakshatra: moon.nakshatra, pada: moon.pada,
    chandra_rashi: moon.rashi_name, surya_rashi: sun.rashi_name,
  };

  const d = vimshottari(moon.lon, dtUTC, now, zone);
  return {
    lagna, grahas, rasi_chart, navamsa_chart, birth_panchang,
    dashas: d.dashas, current_dasha: d.current_dasha,
    dasha_summary: { janma_lord: d.janma_lord, balance_years: d.balance_years },
    ayanamsa, node,
  };
}
