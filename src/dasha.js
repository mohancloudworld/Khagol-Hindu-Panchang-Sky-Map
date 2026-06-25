// Vimshottari maha/antar dasha. Year = 365.25 days.
import { ymdOfInstant, isoYMD } from "./tz.js";

const LORDS = [["Ketu", 7], ["Venus", 20], ["Sun", 6], ["Moon", 10], ["Mars", 7], ["Rahu", 18], ["Jupiter", 16], ["Saturn", 19], ["Mercury", 17]];
export const NAMES = LORDS.map((x) => x[0]);
export const YEARS = Object.fromEntries(LORDS);
const YEAR_DAYS = 365.25, NAK_ARC = 360 / 27;
const addYears = (dt, y) => new Date(dt.getTime() + y * YEAR_DAYS * 86400000);

function mahaList(nakIndex, elapsed, birth) {
  let idx = nakIndex % 9, cur = birth, bal = (1 - elapsed) * YEARS[NAMES[idx]];
  let end = addYears(cur, bal);
  const out = [{ lord: NAMES[idx], start: cur, end }];
  let total = bal;
  while (total < 120 - 1e-6) {
    idx = (idx + 1) % 9;
    const yrs = Math.min(YEARS[NAMES[idx]], 120 - total);
    cur = end; end = addYears(cur, yrs);
    out.push({ lord: NAMES[idx], start: cur, end });
    total += yrs;
  }
  return out;
}

function antarList(maha) {
  const full = YEARS[maha.lord], notional = addYears(maha.end, -full), idx = NAMES.indexOf(maha.lord);
  const out = []; let cur = notional;
  for (let k = 0; k < 9; k++) {
    const al = NAMES[(idx + k) % 9], seg = full * YEARS[al] / 120;
    const s = cur, e = addYears(cur, seg); cur = e;
    if (+e > +maha.start && +s < +maha.end) out.push({ lord: al, start: new Date(Math.max(+s, +maha.start)), end: new Date(Math.min(+e, +maha.end)) });
  }
  return out;
}

export function vimshottari(moonLon, birthUTC, nowUTC, zone = "UTC") {
  const iso = (dt) => isoYMD(ymdOfInstant(dt, zone));
  const nakIndex = Math.floor(moonLon / NAK_ARC), elapsed = (moonLon % NAK_ARC) / NAK_ARC;
  const mahas = mahaList(nakIndex, elapsed, birthUTC);
  const dashas = [], current = { maha: null, antar: null, maha_ends: null };
  for (const m of mahas) {
    const antars = antarList(m);
    dashas.push({ lord: m.lord, start: iso(m.start), end: iso(m.end), antar: antars.map((a) => ({ lord: a.lord, start: iso(a.start), end: iso(a.end) })) });
    if (m.start <= nowUTC && nowUTC < m.end) {
      current.maha = m.lord; current.maha_ends = iso(m.end);
      for (const a of antars) if (a.start <= nowUTC && nowUTC < a.end) { current.antar = a.lord; break; }
    }
  }
  const lord = NAMES[nakIndex % 9];
  return { janma_lord: lord, balance_years: Math.round((1 - elapsed) * YEARS[lord] * 100) / 100, dashas, current_dasha: current };
}
