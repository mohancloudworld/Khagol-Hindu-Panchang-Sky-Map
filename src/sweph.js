// ESM wrapper around the Swiss Eph (Moshier) WASM.
// All longitudes are SIDEREAL. JS is single-threaded, so no lock is needed (unlike
// pyswisseph), but the sidereal mode is still global state, so set it before each call group.
import createSweph from "../vendor/sweph.mjs";

const SIDM = { lahiri: 1, raman: 3, kp: 5 };            // SE_SIDM_LAHIRI / _RAMAN / _KRISHNAMURTI
export const BODY = {
  sun: 0, moon: 1, mercury: 2, venus: 3, mars: 4, jupiter: 5, saturn: 6,
  uranus: 7, neptune: 8, pluto: 9, mean_node: 10, true_node: 11, earth: 14,
};

let M = null, fn = null;

export async function init() {
  if (M) return;
  M = await createSweph();
  fn = {
    setSid: M.cwrap("w_set_sid_mode", null, ["number"]),
    julday: M.cwrap("w_julday", "number", ["number", "number", "number", "number"]),
    lon: M.cwrap("w_lon", "number", ["number", "number"]),
    speed: M.cwrap("w_speed", "number", ["number", "number"]),
    ayan: M.cwrap("w_ayanamsa", "number", ["number"]),
    lagna: M.cwrap("w_lagna", "number", ["number", "number", "number"]),
    rise: M.cwrap("w_rise", "number", ["number", "number", "number", "number", "number", "number"]),
    equ: M.cwrap("w_equ", "number", ["number", "number", "number"]),
    eclLon: M.cwrap("w_ecl_lon", "number", ["number", "number"]),
    pheno: M.cwrap("w_pheno", "number", ["number", "number", "number"]),
    sidtime: M.cwrap("w_sidtime", "number", ["number"]),
    setTopo: M.cwrap("w_set_topo", null, ["number", "number", "number"]),
    helio: M.cwrap("w_helio", "number", ["number", "number", "number"]),
  };
}

const setMode = (ay) => fn.setSid(SIDM[ay] ?? SIDM.lahiri);

export const julday = (y, mo, d, h) => fn.julday(y, mo, d, h);

export function sunMoonLon(jd, ay = "lahiri") {
  setMode(ay);
  return [fn.lon(jd, BODY.sun), fn.lon(jd, BODY.moon)];
}
export function longitude(jd, body, ay = "lahiri") { setMode(ay); return fn.lon(jd, BODY[body]); }
export function speed(jd, body, ay = "lahiri") { setMode(ay); return fn.speed(jd, BODY[body]); }
export function ayanamsaDeg(jd, ay = "lahiri") { setMode(ay); return fn.ayan(jd); }
export function lagna(jd, lat, lon, ay = "lahiri") { setMode(ay); return fn.lagna(jd, lat, lon); }
// Next rise (rise=true) or set (UT Julian Day) at/after jd for (lon,lat,alt_m). body: "sun"|"moon".
export function nextRise(jd, lon, lat, alt = 0, rise = true, body = "sun") { return fn.rise(jd, lon, lat, alt, rise ? 1 : 0, BODY[body]); }

// Apparent equatorial-of-date for the sky views (RA/Dec are ayanamsa-independent).
export function raDecDist(jd, body) {
  const i = BODY[body];
  return { ra_deg: fn.equ(jd, i, 0), dec_deg: fn.equ(jd, i, 1), dist_au: fn.equ(jd, i, 2) };
}
export const eclLon = (jd, body) => fn.eclLon(jd, BODY[body]);      // tropical, for Moon elongation
export const magnitude = (jd, body) => fn.pheno(jd, BODY[body], 0);
export const illumFraction = (jd, body) => fn.pheno(jd, BODY[body], 1);
export const gastHours = (jd) => fn.sidtime(jd);                    // Greenwich apparent sidereal time
export const setTopo = (lon, lat, alt = 0) => fn.setTopo(lon, lat, alt);   // observer for topocentric sky
export function helioXYZ(jd, body) { const i = BODY[body]; return [fn.helio(jd, i, 0), fn.helio(jd, i, 1), fn.helio(jd, i, 2)]; }
