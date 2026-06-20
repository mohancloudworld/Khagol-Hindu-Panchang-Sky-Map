// Assemble the full /api/panchang response and the /api/month grid.
// Combines the validated pieces (angas, sunrise, masa, samvatsara, day-windows, festivals) into
// the exact dict shapes the front end expects. `zone` is an IANA name; instants -> local ISO.
import * as swe from "./sweph.js";
import { tithi, nakshatra, yoga, karana, varaForWeekday } from "./panchang.js";
import { amantaMasa, samvatsara } from "./masa.js";
import { kalams, ritualKaals, horas, choghadiya } from "./daywindows.js";
import { festivalsInYear, sankrantiRashi } from "./festivals.js";
import { governingSunrise, riseSetOn, sunriseOn } from "./suntime.js";
import { jdToDate, dateToJd, ymdOfInstant, isoYMD, isoLocal, clockHMS, addDays } from "./tz.js";

const varaOf = (ymd) => varaForWeekday(new Date(Date.UTC(ymd.y, ymd.mo - 1, ymd.d)).getUTCDay());
const win = (w, zone) => (w && w.start ? { start: isoLocal(w.start, zone), end: isoLocal(w.end, zone) } : null);
const clock = (dt, zone) => (dt ? clockHMS(dt, zone) : null);
const iso = (dt, zone) => (dt ? isoLocal(dt, zone) : null);
function angaLocal(a, zone) {
  const { ends_at_jd, ...rest } = a;
  return { ...rest, ends_at_local: ends_at_jd != null ? isoLocal(jdToDate(ends_at_jd), zone) : null };
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
    solar_day: { vara_now: varaNow.name, governing_sunrise: iso(gov, zone), next_sunrise: iso(next, zone), is_pre_dawn: isPreDawn },
    sun: { sunrise_local: clock(srToday, zone), sunset_local: clock(ssToday, zone) },
    moon: { moonrise_local: clock(moonrise, zone), moonset_local: clock(moonset, zone) },
    kalam: Object.fromEntries(Object.entries(kal).map(([k, v]) => [k, win(v, zone)])),
    muhurta: Object.fromEntries(Object.entries(muh).map(([k, v]) => [k, win(v, zone)])),
    hora: hora.map((h) => ({ lord: h.lord, start: iso(h.start, zone), end: iso(h.end, zone) })),
    choghadiya: chogh.map((c) => ({ name: c.name, good: c.good, lord: c.lord, start: iso(c.start, zone), end: iso(c.end, zone) })),
    festivals: dayFestivals(dateLocal, yearFests, zone),
    ayanamsa,
    ayanamsa_deg: Math.round(swe.ayanamsaDeg(jdNow, ayanamsa) * 1000) / 1000,
  };
}

export function buildMonth(year, month, lat, lon, zone, ayanamsa = "lahiri") {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const yearFests = festivalsInYear(year, lat, lon, zone, ayanamsa);
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
      sunrise: clock(sr, zone), sunset: clock(ss, zone),
    });
  }
  return out;
}
