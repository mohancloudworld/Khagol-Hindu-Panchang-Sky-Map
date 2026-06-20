// Apparent sky — the /api/sky equivalent, computed locally (Moshier).
// Positions are ~arcsec vs a DE440s reference (Moshier used for the visual sky);
// alt/az are geometric (refraction omitted — sub-arcmin near the horizon only).
import * as swe from "./sweph.js";

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
  return { phasePct, phaseAngle, mag };
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
  } else e.mag = +swe.magnitude(jd, id).toFixed(2);
  return e;
}

export function computeSky(lat, lon, dtUTC, ayanamsa = "lahiri") {
  const jd = jdFromDate(dtUTC);
  swe.setTopo(lon, lat, 0);                 // topocentric observer (Moon parallax) — matches sky.py
  const lstHours = norm360HoursFromGast(swe.gastHours(jd), lon);
  const bodies = Object.keys(BODY_DISPLAY).map((id) => bodyEntry(id, jd, lstHours, lat));
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
