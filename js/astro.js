// astro.js -- client-side star placement (Section 5.3).
//
// Stars are stored as J2000 equatorial coordinates and transformed to the screen each
// frame from LST + latitude. The J2000 -> epoch-of-date precession (IAU-1976) is REQUIRED:
// by 2026 the equinox has precessed ~22' and stars would otherwise drift off the
// backend-computed planets. Nutation/aberration/proper-motion are ignored (<0.01 deg).

const DEG = Math.PI / 180.0;
const RAD = 180.0 / Math.PI;
const ARCSEC = DEG / 3600.0;

// Sidereal rate: sidereal time runs 1.00273790935x faster than solar time.
export const SIDEREAL_RATE = 1.00273790935;

// --- small 3-vector / matrix helpers (row-major 3x3 as [9]) ---------------

export function matVec(m, v) {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

function matMul(a, b) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
}

function rotZ(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}
function rotY(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}
function rotX(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [1, 0, 0, 0, c, -s, 0, s, c];
}

const ECL_OBLIQUITY = 23.4393 * DEG;     // mean obliquity (deep-time uniform-precession model)
const GEN_PRECESSION = 50.2879 * ARCSEC; // general precession in longitude, rad/yr

// Uniform (first-order) precession for DEEP time: a constant-rate rotation about the ecliptic
// pole, P = Rx(eps).Rz(psi).Rx(-eps), psi = rate * (years from J2000). Unlike the IAU polynomial
// it never diverges and correctly cycles the pole (validated: Thuban 0.3 deg at 2787 BCE, Vega
// 4.8 deg at 13727 CE, Polaris now). Approximate: it ignores the slow drift of rate/obliquity
// (full Vondrak 2011 is the accuracy upgrade, BACKLOG B1).
export function uniformPrecessionMatrix(jdSim) {
  const psi = ((jdSim - 2451545.0) / 365.25) * GEN_PRECESSION;
  return matMul(rotX(ECL_OBLIQUITY), matMul(rotZ(psi), rotX(-ECL_OBLIQUITY)));
}

// Ecliptic-frame uniform precession: just the inner Rz of uniformPrecessionMatrix (rotation
// about the ecliptic pole). For vectors ALREADY in the ecliptic frame -- e.g. the orrery's
// raDecToEcliptic star directions -- this carries them from J2000 to the equinox of date, so
// the stars share the frame of the of-date bodies + Rashi band.
export function eclipticPrecessionMatrix(jdSim) {
  return rotZ(((jdSim - 2451545.0) / 365.25) * GEN_PRECESSION);
}

// --- precession ------------------------------------------------------------

// IAU-1976 precession matrix J2000 -> the epoch of jdSim (TT; UT is fine here).
// P = Rz(-z) . Ry(+theta) . Rz(-zeta), right-handed (+x to equinox, +z to N pole).
export function precessionMatrix(jdSim) {
  const T = (jdSim - 2451545.0) / 36525.0;
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T * T * T) * ARCSEC;
  const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T * T * T) * ARCSEC;
  const theta = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T * T * T) * ARCSEC;
  return matMul(rotZ(-z), matMul(rotY(theta), rotZ(-zeta)));
}

// Equatorial-of-date -> render horizontal frame (x East, y Up, z South) as a row-major
// 3x3. Derived so M . (cosD cosA, cosD sinA, sinD) == horizontalToVec(eqToHorizontal()):
//   theta = LST in degrees, phi = latitude. (The NCP column maps to (0, sin phi, -cos phi)
//   = altitude phi due north -- the Polaris check.)
export function horizontalMatrix(lstHours, latDeg) {
  const th = lstHours * 15 * DEG, ph = latDeg * DEG;
  const st = Math.sin(th), ct = Math.cos(th), sp = Math.sin(ph), cp = Math.cos(ph);
  return [
    -st, ct, 0,
    cp * ct, cp * st, sp,
    sp * ct, sp * st, -cp,
  ];
}

// Full star-group rotation: world = M . raDecToVec(J2000), with precession folded in.
// One matrix multiply per frame -> zero per-star CPU (Section 6.3).
export function starGroupMatrix(lstHours, latDeg, jdSim, deep = false) {
  const prec = deep ? uniformPrecessionMatrix(jdSim) : precessionMatrix(jdSim);
  return matMul(horizontalMatrix(lstHours, latDeg), prec);
}

// Equatorial unit vector from RA/Dec (degrees), J2000 convention.
export function raDecToVec(raDeg, decDeg) {
  const ra = raDeg * DEG, dec = decDeg * DEG;
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
}

export function vecToRaDec(v) {
  const ra = Math.atan2(v[1], v[0]) * RAD;
  const dec = Math.asin(Math.max(-1, Math.min(1, v[2]))) * RAD;
  return { ra: (ra + 360) % 360, dec };
}

// Ecliptic latitude (deg) of a J2000 equatorial position -- how far a star sits off the ecliptic
// plane, used to decide whether a nakshatra star rides the Rashi band (the "on-ecliptic" test).
export function eclipticLatitude(raDeg, decDeg) {
  const ra = raDeg * DEG, dec = decDeg * DEG;
  const y = Math.cos(dec) * Math.sin(ra), z = Math.sin(dec);
  return Math.asin(Math.max(-1, Math.min(1, -y * Math.sin(ECL_OBLIQUITY) + z * Math.cos(ECL_OBLIQUITY)))) * RAD;
}

// Precess J2000 RA/Dec to the epoch of jdSim.
export function precessRaDec(raDeg, decDeg, jdSim) {
  return vecToRaDec(matVec(precessionMatrix(jdSim), raDecToVec(raDeg, decDeg)));
}

// --- time ------------------------------------------------------------------

// Advance a fetched LST (hours) by dtSeconds of real time (Section 5.3).
export function advanceLst(lstFetchedHours, dtSeconds) {
  return ((lstFetchedHours + (dtSeconds / 3600.0) * SIDEREAL_RATE) % 24 + 24) % 24;
}

// Unix-ms epoch -> Julian Day (UT).
export function jdFromDate(date) {
  return date.getTime() / 86400000.0 + 2440587.5;
}

// --- equatorial -> horizontal ---------------------------------------------

// (alt, az) in degrees; az 0=N, 90=E. RA/Dec already epoch-of-date.
export function eqToHorizontal(raDeg, decDeg, lstHours, latDeg) {
  const H = (lstHours * 15.0 - raDeg) * DEG;     // hour angle
  const dec = decDeg * DEG, lat = latDeg * DEG;
  const sinAlt = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(H);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * RAD;
  const az = Math.atan2(
    -Math.cos(dec) * Math.sin(H),
    Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.sin(lat) * Math.cos(H),
  ) * RAD;
  return { alt, az: (az + 360) % 360 };
}

// Saemundsson true->apparent refraction (arcmin/60 added), only above the horizon and
// when the atmosphere is on (Section 5.3 / Phase 7C).
export function refract(altDeg, atmosphere = true) {
  if (!atmosphere || altDeg <= -1.0) return altDeg;
  const R = 1.02 / Math.tan((altDeg + 10.3 / (altDeg + 5.11)) * DEG);
  return altDeg + R / 60.0;
}

// Horizontal -> render unit vector: x East, y Up, z -North (Section 5.3 convention).
export function horizontalToVec(altDeg, azDeg) {
  const alt = altDeg * DEG, az = azDeg * DEG;
  return [Math.cos(alt) * Math.sin(az), Math.sin(alt), -Math.cos(alt) * Math.cos(az)];
}
