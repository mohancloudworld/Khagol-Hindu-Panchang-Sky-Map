// Assemble the full /api/panchang response and the /api/month grid — ports app/panchang/assemble.py.
// Combines the validated pieces (angas, sunrise, masa, samvatsara, day-windows, festivals) into
// the exact dict shapes the front end expects. `zone` is an IANA name; instants -> local ISO.
import * as swe from "./sweph.js";
import { tithi, nakshatra, yoga, karana, varaForWeekday } from "./panchang.js";
import { amantaMasa, samvatsara } from "./masa.js";
import { kalams, ritualKaals, horas, choghadiya } from "./daywindows.js";
import { festivalsInYear, sankrantiRashi } from "./festivals.js";
import { governingSunrise, riseSetOn, sunriseOn } from "./suntime.js";
import { grahanaOnDay, lunarEclipses, solarEclipses } from "./eclipse.js";
import { jdToDate, dateToJd, ymdOfInstant, isoYMD, isoLocal, clockHMS, addDays, localMidnightJd } from "./tz.js";

const varaOf = (ymd) => varaForWeekday(new Date(Date.UTC(ymd.y, ymd.mo - 1, ymd.d)).getUTCDay());
const win = (w, zone) => (w && w.start ? { start: isoLocal(w.start, zone), end: isoLocal(w.end, zone) } : null);
const clock = (dt, zone) => (dt ? clockHMS(dt, zone) : null);
const iso = (dt, zone) => (dt ? isoLocal(dt, zone) : null);
function angaLocal(a, zone) {
  const { ends_at_jd, ...rest } = a;
  return { ...rest, ends_at_local: ends_at_jd != null ? isoLocal(jdToDate(ends_at_jd), zone) : null };
}
// Add a <key>_local beside every UTC timestamp in a nested structure. Eclipse contacts come
// out of the compute core in UTC (one instant worldwide, which is the point); the UI renders
// clock strings by slicing the ISO, so it needs the same instants written in the local zone --
// the same split as festivals' window / window_local.
const UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
function localiseTimes(value, zone) {
  if (Array.isArray(value)) return value.map((v) => localiseTimes(v, zone));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).flatMap(([k, v]) =>
      typeof v === "string" && UTC_ISO.test(v)
        ? [[k, v], [`${k}_local`, isoLocal(new Date(v), zone)]]
        : [[k, localiseTimes(v, zone)]]));
  }
  return value;
}
function dayFestivals(dYMD, yearFests, zone) {
  const ds = isoYMD(dYMD);
  return yearFests.filter((f) => f.date === ds).map((f) => ({
    name: f.name, kaal: f.kaal, window_local: win(f.window, zone), disputed: f.disputed, note: f.note,
  }));
}

export function buildPanchang(lat, lon, dtUTC, zone, ayanamsa = "lahiri") {
  const dateLocal = ymdOfInstant(dtUTC, zone);
  const { gov, next, isPreDawn } = governingSunrise(lat, lon, dtUTC, zone);
  const [srToday, ssToday] = riseSetOn(lat, lon, dateLocal, zone);
  const nextSrLocal = sunriseOn(lat, lon, addDays(dateLocal, 1), zone);
  const [moonrise, moonset] = riseSetOn(lat, lon, dateLocal, zone, "moon");

  const varaCivil = varaOf(dateLocal);
  const govDate = ymdOfInstant(gov, zone);
  const varaNow = varaOf(govDate);

  const jdSr = dateToJd(srToday), jdNow = dateToJd(dtUTC);
  const tithiSr = tithi(jdSr, ayanamsa), nakSr = nakshatra(jdSr, ayanamsa);
  const masa = amantaMasa(jdSr, ayanamsa);
  const samv = samvatsara(dateLocal, lat, lon, zone, ayanamsa);

  const ssGov = riseSetOn(lat, lon, govDate, zone)[1];
  const hora = horas(gov, ssGov, next, varaNow.index);
  const chogh = choghadiya(gov, ssGov, next, varaNow.index);
  const kal = kalams(srToday, ssToday, varaCivil.index);
  const muh = ritualKaals(srToday, ssToday, nextSrLocal, moonrise);
  const yearFests = festivalsInYear(dateLocal.y, lat, lon, zone, ayanamsa);
  // Grahana: an eclipse touching this local day, with local visibility. Facts only —
  // observance windows (sutak and the rest) are tradition-specific and stay out until a
  // named authority defines them.
  const grahana = localiseTimes(grahanaOnDay(localMidnightJd(dateLocal, zone),
                                             localMidnightJd(addDays(dateLocal, 1), zone),
                                             [lon, lat, 0]), zone);

  return {
    location: { lat, lon, tz: zone },
    date_local: isoYMD(dateLocal),
    time_local: isoLocal(dtUTC, zone),
    samvatsara: { number: samv.number, name: samv.name },
    masa: { name: masa.name, is_adhika: masa.is_adhika, amanta: true },
    paksha: tithiSr.paksha,
    tithi_at_sunrise: angaLocal(tithiSr, zone),
    tithi_now: angaLocal(tithi(jdNow, ayanamsa), zone),
    nakshatra_at_sunrise: angaLocal(nakSr, zone),
    nakshatra_now: angaLocal(nakshatra(jdNow, ayanamsa), zone),
    yoga: angaLocal(yoga(jdNow, ayanamsa), zone),
    karana: angaLocal(karana(jdNow, ayanamsa), zone),
    vara: `${varaCivil.name} (${varaCivil.english})`,
    vara_index: varaCivil.index,
    solar_day: { vara_now: varaNow.name, governing_sunrise: iso(gov, zone), next_sunrise: iso(next, zone), is_pre_dawn: isPreDawn },
    sun: { sunrise_local: clock(srToday, zone), sunset_local: clock(ssToday, zone) },
    moon: { moonrise_local: clock(moonrise, zone), moonset_local: clock(moonset, zone) },
    kalam: Object.fromEntries(Object.entries(kal).map(([k, v]) => [k, win(v, zone)])),
    muhurta: Object.fromEntries(Object.entries(muh).map(([k, v]) => [k, win(v, zone)])),
    hora: hora.map((h) => ({ lord: h.lord, start: iso(h.start, zone), end: iso(h.end, zone) })),
    choghadiya: chogh.map((c) => ({ name: c.name, good: c.good, lord: c.lord, start: iso(c.start, zone), end: iso(c.end, zone) })),
    festivals: dayFestivals(dateLocal, yearFests, zone),
    grahana,
    ayanamsa,
    ayanamsa_deg: Math.round(swe.ayanamsaDeg(jdNow, ayanamsa) * 1000) / 1000,
  };
}

// Eclipses whose maximum falls in this local month, keyed by local date string.
function monthEclipses(year, month, lat, lon, zone) {
  const start = localMidnightJd({ y: year, mo: month, d: 1 }, zone);
  const end = localMidnightJd({ y: month === 12 ? year + 1 : year, mo: month === 12 ? 1 : month + 1, d: 1 }, zone);
  const geo = [lon, lat, 0];
  const out = new Map();
  for (const ev of [...lunarEclipses(start - 40, 3, geo), ...solarEclipses(start - 40, 3, geo)]) {
    const jd = dateToJd(new Date(ev.max));
    if (jd < start || jd >= end) continue;
    const local = localiseTimes(ev, zone);
    const key = isoYMD(ymdOfInstant(new Date(ev.max), zone));
    out.set(key, (out.get(key) || []).concat([local]));
  }
  return out;
}

export function buildMonth(year, month, lat, lon, zone, ayanamsa = "lahiri") {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const yearFests = festivalsInYear(year, lat, lon, zone, ayanamsa);
  // Eclipses are searched ONCE for the month (two ephemeris searches), not per day: an
  // eclipse falls on the local date its maximum lands on, so bucketing by that date is
  // enough for a grid marker. The day card (buildPanchang) still does the exact
  // day-overlap test, penumbral phases included.
  const monthGrahana = monthEclipses(year, month, lat, lon, zone);
  const out = [];
  let prevSrJd = null;
  for (let dom = 1; dom <= days; dom++) {
    const d = { y: year, mo: month, d: dom };
    const [sr, ss] = riseSetOn(lat, lon, d, zone);
    const jdSr = dateToJd(sr);
    const tithiSr = tithi(jdSr, ayanamsa), nakSr = nakshatra(jdSr, ayanamsa), masa = amantaMasa(jdSr, ayanamsa);
    let fests = dayFestivals(d, yearFests, zone);
    if (prevSrJd != null) {
      const rashi = sankrantiRashi(prevSrJd, jdSr, ayanamsa);
      if (rashi) fests = fests.concat([{ name: `${rashi} Sankranti`, kaal: "udaya", window_local: null, disputed: false, note: null }]);
    }
    prevSrJd = jdSr;
    const n = tithiSr.number;
    out.push({
      date: isoYMD(d), vara: varaOf(d).name,
      tithi_at_sunrise: tithiSr.display, tithi_n: n, nakshatra_at_sunrise: nakSr.name,
      masa: masa.name, paksha: tithiSr.paksha, festivals: fests,
      is_ekadashi: n === 11 || n === 26, is_purnima: n === 15, is_amavasya: n === 30,
      grahana: monthGrahana.get(isoYMD(d)) || [],
      sunrise: clock(sr, zone), sunset: clock(ss, zone),
    });
  }
  return out;
}
