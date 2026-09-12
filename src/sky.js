// Apparent sky — the /api/sky equivalent, computed locally (Moshier). Ports app/sky.py.
// Positions are ~arcsec vs the app's DE440s (you accepted Moshier for the visual sky);
// alt/az are geometric (refraction omitted — sub-arcmin near the horizon only).
import * as swe from "./sweph.js";
import * as eclipse from "./eclipse.js";

const BODY_DISPLAY = {
  sun: "Sun", moon: "Moon", mercury: "Mercury", venus: "Venus", mars: "Mars",
  jupiter: "Jupiter", saturn: "Saturn", uranus: "Uranus", neptune: "Neptune",
};
const SUN_MAG = -26.74;
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const wrap180 = (d) => ((d + 180) % 360 + 360) % 360 - 180;
const norm360 = (d) => ((d % 360) + 360) % 360;

function jdFromDate(dt) {
  const h = dt.getUTCHours() + dt.getUTCMinutes() / 60 + (dt.getUTCSeconds() + dt.getUTCMilliseconds() / 1000) / 3600;
  return swe.julday(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), h);
}

// Geometric alt/az from RA/Dec(of-date) + LST + latitude (azimuth from North, eastward).
function altaz(raHours, decDeg, lstHours, latDeg) {
  const H = (lstHours - raHours) * 15 * D2R, d = decDeg * D2R, phi = latDeg * D2R;
  const sinAlt = Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(H);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * R2D;
  const az = Math.atan2(-Math.cos(d) * Math.sin(H),
    Math.cos(phi) * Math.sin(d) - Math.sin(phi) * Math.cos(d) * Math.cos(H)) * R2D;
  return [alt, norm360(az)];
}

function moonPhotometry(jd) {
  const elong = norm360(swe.eclLon(jd, "moon") - swe.eclLon(jd, "sun"));   // 0..360
  const phasePct = (1 - Math.cos(elong * D2R)) / 2 * 100;
  const phaseAngle = Math.abs(180 - elong);
  const i = phaseAngle * D2R;
  const mag = -12.73 + 1.49 * i + 0.043 * i ** 4;
  return { phasePct, phaseAngle, mag, waxing: elong < 180 };
}

function bodyEntry(id, jd, lstHours, lat) {
  const a = swe.raDecDist(jd, id);
  const raH = a.ra_deg / 15;
  const b = swe.raDecDist(jd + 60 / 86400, id);   // +60 s, same of-date frame
  const raRate = wrap180(b.ra_deg - a.ra_deg) * 60;        // deg/hour
  const decRate = (b.dec_deg - a.dec_deg) * 60;
  const [alt, az] = altaz(raH, a.dec_deg, lstHours, lat);

  const e = {
    id, name: BODY_DISPLAY[id],
    alt: +alt.toFixed(4), alt_true: +alt.toFixed(4), az: +az.toFixed(4),
    ra_hours: +raH.toFixed(5), dec_deg: +a.dec_deg.toFixed(4),
    ra_rate_dph: +raRate.toFixed(5), dec_rate_dph: +decRate.toFixed(5),
    distance_au: +a.dist_au.toFixed(6),
    mag: null, phase_percent: null, phase_angle_deg: null,
  };
  if (id === "sun") e.mag = SUN_MAG;
  else if (id === "moon") {
    const m = moonPhotometry(jd);
    e.mag = +m.mag.toFixed(2);
    e.phase_percent = +m.phasePct.toFixed(1);
    e.phase_angle_deg = +m.phaseAngle.toFixed(1);
    e.phase_waxing = m.waxing;
  } else e.mag = +swe.magnitude(jd, id).toFixed(2);
  return e;
}

// An eclipse in progress: the Moon's brightness comes from Earth's shadow, not from its
// phase, and the Sun's from how much of it the Moon is covering. moonPhotometry() only knows
// the Sun-Moon elongation, so without this the views draw a full Moon straight through a
// total lunar eclipse. Attaches `eclipse` to the affected body and corrects `mag`.
function attachEclipses(bodies, jd, lat, lon) {
  const moon = bodies.find((b) => b.id === "moon");
  const sun = bodies.find((b) => b.id === "sun");
  if (moon && sun) {
    const sh = eclipse.moonShadow(jd, moon.distance_au, sun.ra_hours, sun.dec_deg);
    if (sh) {
      moon.eclipse = sh;
      moon.mag = +(moon.mag + sh.mag_delta).toFixed(2);
    }
  }
  if (sun) {
    const ob = eclipse.sunObscuration(jd, lat, lon);
    if (ob) {
      sun.eclipse = ob;
      // Obscuring 99% of the disc costs only ~5 magnitudes; the Sun stays overwhelming
      // until the last sliver goes, which is exactly why totality is so abrupt.
      sun.mag = +(SUN_MAG - 2.5 * Math.log10(Math.max(1e-5, 1 - ob.obscuration))).toFixed(2);
    }
  }
}

export function computeSky(lat, lon, dtUTC, ayanamsa = "lahiri") {
  const jd = jdFromDate(dtUTC);
  swe.setTopo(lon, lat, 0);                 // topocentric observer (Moon parallax) — matches sky.py
  const lstHours = norm360HoursFromGast(swe.gastHours(jd), lon);
  const bodies = Object.keys(BODY_DISPLAY).map((id) => bodyEntry(id, jd, lstHours, lat));
  attachEclipses(bodies, jd, lat, lon);
  return {
    time_utc: dtUTC.toISOString().replace(/\.\d+Z$/, "Z").replace(/\.\d+$/, ""),
    lat, lon,
    lst_hours: +lstHours.toFixed(4),
    bodies,
    ayanamsa_deg: +swe.ayanamsaDeg(jd, ayanamsa).toFixed(4),
  };
}

function norm360HoursFromGast(gast, lon) {
  let l = (gast + lon / 15) % 24;
  return l < 0 ? l + 24 : l;
}
