// Eclipses (grahana) — the one class of event that is genuinely observer-dependent.
//
// Two jobs:
//   1. `moonShadow` / `sunObscuration` — what the sky views need to DRAW an eclipse in
//      progress. The five angas are geocentric angles (see panchang.js) and stay that way;
//      an eclipse is light and shadow, so everything here is topocentric where it matters.
//   2. `lunarEclipses` / `solarEclipses` / `grahanaOnDay` — eclipses as listable events,
//      with contact times, magnitude and local visibility, for the panchang and calendar.
//
// Reports FACTS only — type, contacts, magnitude, whether it is above your horizon.
// Observance rules (sutak windows, the fast, the daan period) are deliberately NOT here:
// they vary by tradition and need a named authority before they can be encoded.
import * as swe from "./sweph.js";

const R_MOON_KM = 1737.4;
const AU_KM = 149597870.7;
const D2R = Math.PI / 180, R2D = 180 / Math.PI;

// Swiss Ephemeris azimuths (attr[4]) are measured from SOUTH westward; the sky views and
// sky.js use the astronomical convention, from NORTH eastward.
const azFromNorth = (azSwe) => (azSwe + 180) % 360;

export function eclipseTypeName(flag) {
  if (flag & swe.ECL.ANNULAR_TOTAL) return "Hybrid";
  if (flag & swe.ECL.TOTAL) return "Total";
  if (flag & swe.ECL.ANNULAR) return "Annular";
  if (flag & swe.ECL.PARTIAL) return "Partial";
  if (flag & swe.ECL.PENUMBRAL) return "Penumbral";
  return null;
}

// Moon's apparent semidiameter (deg) from its distance in AU.
export const moonSemidiameter = (distAu) => Math.asin(R_MOON_KM / (distAu * AU_KM)) * R2D;

// Fraction of disc `r` NOT covered by disc `R` whose centres are `d` apart (all same units).
// Standard two-circle lens area; used for the Moon in the umbra and the Sun behind the Moon.
function uncoveredFraction(r, R, d) {
  if (d >= r + R) return 1;              // clear of the shadow
  if (d <= R - r) return 0;              // wholly inside it
  if (d <= r - R) return 1 - (R * R) / (r * r);   // shadow wholly inside the disc
  const a = (d * d + r * r - R * R) / (2 * d * r);
  const b = (d * d + R * R - r * r) / (2 * d * R);
  const A = r * r * Math.acos(Math.max(-1, Math.min(1, a)))
          + R * R * Math.acos(Math.max(-1, Math.min(1, b)))
          - 0.5 * Math.sqrt(Math.max(0, (-d + r + R) * (d + r - R) * (d - r + R) * (d + r + R)));
  return Math.max(0, 1 - A / (Math.PI * r * r));
}

// A totally eclipsed Moon still glows with refracted light — around mag -1.5 for a
// mid-range (Danjon L=2) eclipse. Nothing in Swiss Ephemeris predicts that brightness, so
// the lit-fraction dimming is floored at the value that lands on it. Documented fudge.
const TOTALITY_LIT_FLOOR = 3.2e-5;

/* Shadow geometry for a lunar eclipse in progress at `jd`, or null when there is none.
 *
 * Earth's umbral and penumbral radii are not exposed by the Swiss Ephemeris API, so they
 * are recovered from the two magnitudes it does report, which keeps the drawing consistent
 * with the numbers the app displays:
 *     umbral magnitude U = (u + m - s) / 2m   ->   u = 2mU - m + s
 * with m the Moon's semidiameter and s its distance from the shadow axis (attr[7]).
 *
 * `sunRa/sunDec` place the shadow: Earth's shadow axis points at the antisolar point.
 * The views project that point themselves, so the shadow lands correctly in any projection.
 */
export function moonShadow(jd, moonDistAu, sunRaHours, sunDecDeg) {
  const e = swe.lunEclipseHow(jd);                  // geocentric: shadow exists regardless of horizon
  if (!e.flag) return null;

  const m = moonSemidiameter(moonDistAu);
  const U = e.attr[0], P = e.attr[1], s = e.attr[7];
  const umbra = 2 * m * U - m + s;
  const penumbra = 2 * m * P - m + s;

  const litUmbral = uncoveredFraction(m, umbra, s);
  const litPenumbral = uncoveredFraction(m, penumbra, s);
  // Penumbral shading is shallow (the Sun is only partly hidden from those parts of the
  // Moon), so it dims far less than the geometric fraction suggests; 0.35 is the visual
  // weight that matches how a penumbral eclipse actually looks.
  const lit = Math.max(TOTALITY_LIT_FLOOR, litUmbral * (1 - 0.35 * (1 - litPenumbral)));

  return {
    type: eclipseTypeName(e.flag),
    umbral_magnitude: U,
    penumbral_magnitude: P,
    separation_deg: s,
    moon_sd_deg: m,
    umbra_radius_deg: umbra,
    penumbra_radius_deg: penumbra,
    lit_fraction: litUmbral,
    // Where the shadow sits on the sky: the antisolar point.
    shadow_ra_hours: (sunRaHours + 12) % 24,
    shadow_dec_deg: -sunDecDeg,
    // Magnitude penalty, for the info panel and any "how bright is it" readout.
    mag_delta: -2.5 * Math.log10(lit),
    saros: e.attr[9] > -99999 ? { series: e.attr[9], member: e.attr[10] } : null,
  };
}

/* Solar-eclipse circumstances at `jd` for an observer, or null when the Sun is not
 * eclipsed there. Unlike the lunar case this is irreducibly local: the shadow lands on
 * part of the Earth, and two cities in one timezone can see completely different things. */
export function sunObscuration(jd, lat, lon, altM = 0) {
  const e = swe.solEclipseHow(jd, lon, lat, altM);
  if (!e.flag) return null;
  return {
    type: eclipseTypeName(e.flag),
    magnitude: e.attr[0],                       // fraction of the Sun's DIAMETER covered
    diameter_ratio: e.attr[1],
    // attr[2] is Swiss Ephemeris' disc-area obscuration; it can read slightly over 1 for
    // total eclipses, where the physical answer is exactly 1.
    obscuration: Math.min(1, e.attr[2]),
    sun_az: azFromNorth(e.attr[4]),
    sun_alt: e.attr[6],
    saros: e.attr[9] > -99999 ? { series: e.attr[9], member: e.attr[10] } : null,
  };
}

const jdToDate = (jd) => new Date((jd - 2440587.5) * 86400000);
const t = (jd) => (jd ? jdToDate(jd).toISOString().replace(/\.\d+Z$/, "Z") : null);

// Fraction of the Moon's disc inside the umbra at `jd`, from a lun_eclipse_how attr set.
// Geocentric on purpose: how much of the Moon is in Earth's shadow is the same fact for every
// observer — only WHETHER you can see it depends on where you stand (which is visible_here).
// Same radius recovery as moonShadow(); see the comment there.
export function umbralObscuration(jd, attr) {
  const m = swe.apparentDiameter(jd, "moon") / 2;
  if (!(m > 0)) return null;
  const s = attr[7];
  const umbra = 2 * m * attr[0] - m + s;
  return 1 - uncoveredFraction(m, umbra, s);
}

function lunarEvent(e, geo) {
  const how = swe.lunEclipseHow(e.tret[0]);
  const vis = geo ? swe.lunEclipseWhenLoc(e.tret[0] - 0.5, geo[0], geo[1], geo[2]) : null;
  const visibleHere = !!(vis && vis.flag & swe.ECL.VISIBLE
    && Math.abs(vis.tret[0] - e.tret[0]) < 0.5);
  return {
    kind: "lunar",
    grahana: "Chandra Grahana",
    type: eclipseTypeName(e.flag),
    max: t(e.tret[0]),
    penumbral_begin: t(e.tret[6]), penumbral_end: t(e.tret[7]),
    partial_begin: t(e.tret[2]), partial_end: t(e.tret[3]),
    total_begin: t(e.tret[4]), total_end: t(e.tret[5]),
    umbral_magnitude: how.attr[0],
    // Fraction of the Moon's disc swallowed by the umbra at maximum — the "%" the panchang shows.
    obscuration: umbralObscuration(e.tret[0], how.attr),
    visible_here: geo ? visibleHere : null,
    // Only meaningful where visible: the Moon may rise or set mid-eclipse.
    moonrise_during: visibleHere ? t(vis.tret[8]) : null,
    moonset_during: visibleHere ? t(vis.tret[9]) : null,
    max_altitude: visibleHere ? vis.attr[6] : null,
  };
}

function solarEvent(globFlag, tretGlob, geo) {
  const where = swe.solEclipseWhere(tretGlob[0]);
  const ev = {
    kind: "solar",
    grahana: "Surya Grahana",
    type: eclipseTypeName(globFlag),
    max: t(tretGlob[0]),
    begin: t(tretGlob[2]), end: t(tretGlob[3]),
    greatest_at: where.flag > 0 ? { lat: where.tret[1], lon: where.tret[0] } : null,
    // For a solar eclipse the covered fraction really is local: 0 where the shadow misses you.
    visible_here: null, obscuration: null, local: null,
  };
  if (!geo) return ev;
  // Local circumstances: search from just before this eclipse and keep it only if the
  // local hit is the same event (a location outside the path returns the NEXT one).
  const loc = swe.solEclipseWhenLoc(tretGlob[0] - 0.5, geo[0], geo[1], geo[2]);
  if (loc.flag && Math.abs(loc.tret[0] - tretGlob[0]) < 0.5) {
    ev.visible_here = true;
    ev.obscuration = Math.min(1, loc.attr[2]);
    ev.local = {
      type: eclipseTypeName(loc.flag),
      max: t(loc.tret[0]),
      first_contact: t(loc.tret[1]), second_contact: t(loc.tret[2]),
      third_contact: t(loc.tret[3]), fourth_contact: t(loc.tret[4]),
      magnitude: loc.attr[0],
      obscuration: Math.min(1, loc.attr[2]),
      sun_alt_at_max: loc.attr[6],
      sunrise_during: t(loc.tret[5]), sunset_during: t(loc.tret[6]),
    };
  } else {
    ev.visible_here = false;
    ev.obscuration = 0;
  }
  return ev;
}

// The next `count` lunar eclipses from `jd`. geo = [lon, lat, altM] adds local visibility.
export function lunarEclipses(jd, count = 4, geo = null) {
  const out = [];
  let j = jd;
  for (let i = 0; i < count; i++) {
    const e = swe.lunEclipseWhen(j);
    if (!e.flag || !e.tret[0]) break;
    out.push(lunarEvent(e, geo));
    j = e.tret[0] + 1;
  }
  return out;
}

export function solarEclipses(jd, count = 4, geo = null) {
  const out = [];
  let j = jd;
  for (let i = 0; i < count; i++) {
    const e = swe.solEclipseWhenGlob(j);
    if (!e.flag || !e.tret[0]) break;
    out.push(solarEvent(e.flag, e.tret, geo));
    j = e.tret[0] + 1;
  }
  return out;
}

// Eclipses touching the local day [jdStart, jdEnd) — what the panchang day card shows.
// An eclipse counts if any part of it (penumbral phase included) falls inside the day.
export function grahanaOnDay(jdStart, jdEnd, geo = null) {
  const out = [];
  const spans = (a, b) => a != null && b != null && b > jdStart && a < jdEnd;

  const l = swe.lunEclipseWhen(jdStart - 3);
  if (l.flag && spans(l.tret[6] || l.tret[2], l.tret[7] || l.tret[3])) out.push(lunarEvent(l, geo));

  const s = swe.solEclipseWhenGlob(jdStart - 3);
  if (s.flag && spans(s.tret[2], s.tret[3])) out.push(solarEvent(s.flag, s.tret, geo));

  return out.sort((a, b) => (a.max < b.max ? -1 : 1));
}
