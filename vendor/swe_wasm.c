/* swe_wasm.c — thin wrapper exposing just the Swiss Ephemeris calls the extension needs,
 * forced to Moshier mode (SEFLG_MOSEPH → no ephemeris data files, fully self-contained).
 * Mirrors app/panchang/core.py exactly: FLG_MOSEPH | FLG_SIDEREAL | FLG_SPEED, whole-sign
 * houses ('W') for the lagna. Compiled to WASM by build-wasm.sh.
 */
#include <string.h>
#include "swephexp.h"

#define SID_FLAGS (SEFLG_MOSEPH | SEFLG_SIDEREAL | SEFLG_SPEED)

/* Set the sidereal mode (ayanamsa). Pass SE_SIDM_LAHIRI / _RAMAN / _KRISHNAMURTI. */
void w_set_sid_mode(int mode) { swe_set_sid_mode(mode, 0, 0); }

/* Julian Day (UT) from a Gregorian calendar date + fractional hour. */
double w_julday(int y, int mo, int d, double hour) {
  return swe_julday(y, mo, d, hour, SE_GREG_CAL);
}

/* Sidereal ecliptic longitude [0,360) of body ipl at jd_ut (Moshier). */
double w_lon(double jd, int ipl) {
  double xx[6]; char serr[256];
  if (swe_calc_ut(jd, ipl, SID_FLAGS, xx, serr) < 0) return -1.0;
  double l = xx[0]; while (l < 0) l += 360.0; return l - 360.0 * (int)(l / 360.0);
}

/* Sidereal longitude speed (deg/day) of body ipl — sign gives retrograde (Kundali). */
double w_speed(double jd, int ipl) {
  double xx[6]; char serr[256];
  if (swe_calc_ut(jd, ipl, SID_FLAGS, xx, serr) < 0) return 0.0;
  return xx[3];
}

/* Ayanamsa value (deg) at jd_ut for the current sidereal mode. */
double w_ayanamsa(double jd) { return swe_get_ayanamsa_ut(jd); }

/* Sidereal ascendant (lagna) longitude [0,360), whole-sign houses. */
double w_lagna(double jd, double lat, double lon) {
  double cusps[13], ascmc[10];
  swe_houses_ex(jd, SEFLG_SIDEREAL, lat, lon, 'W', cusps, ascmc);
  double a = ascmc[0]; while (a < 0) a += 360.0; return a - 360.0 * (int)(a / 360.0);
}

/* Heliocentric ecliptic-J2000 cartesian (AU) of body ipl: which 0=x 1=y 2=z. For the orrery.
 * Moshier has no barycentric mode; heliocentric (Sun at origin) is visually identical at
 * solar-system scale (only the Sun's ~0.005 AU barycentric wobble differs). */
double w_helio(double jd, int ipl, int which) {
  double xx[6]; char serr[256];
  /* Ecliptic OF DATE (no SEFLG_J2000): matches Skyfield's ecliptic_frame used in orrery.py. */
  if (swe_calc_ut(jd, ipl, SEFLG_MOSEPH | SEFLG_HELCTR | SEFLG_XYZ, xx, serr) < 0) return -999.0;
  return xx[which];
}

/* Greenwich Apparent Sidereal Time (hours) — for LST = GAST + lon/15 (matches sky.py). */
double w_sidtime(double jd) { return swe_sidtime(jd); }

/* Observer for TOPOCENTRIC positions (matches sky.py's earth + wgs84.latlon observer).
 * Must be called before w_equ; the Moon's topocentric parallax reaches ~1°. */
void w_set_topo(double lon, double lat, double alt) { swe_set_topo(lon, lat, alt); }

/* Apparent TOPOCENTRIC equatorial-of-date component of body ipl (Moshier):
 * which 0=RA° 1=Dec° 2=dist(AU). RA/Dec are ayanamsa-independent; drives the 3D/2D sky. */
double w_equ(double jd, int ipl, int which) {
  double xx[6]; char serr[256];
  if (swe_calc_ut(jd, ipl, SEFLG_MOSEPH | SEFLG_EQUATORIAL | SEFLG_SPEED | SEFLG_TOPOCTR, xx, serr) < 0) return -999.0;
  return xx[which];
}

/* Apparent geocentric TROPICAL ecliptic longitude [0,360) of body ipl (for Moon elongation). */
double w_ecl_lon(double jd, int ipl) {
  double xx[6]; char serr[256];
  if (swe_calc_ut(jd, ipl, SEFLG_MOSEPH | SEFLG_SPEED, xx, serr) < 0) return -999.0;
  double l = xx[0]; while (l < 0) l += 360.0; return l - 360.0 * (int)(l / 360.0);
}

/* Apparent magnitude / illuminated fraction / disc size via swe_pheno_ut.
 * which: 0=apparent magnitude (attr[4]), 1=illuminated fraction (attr[1]),
 *        2=apparent diameter of the disc (attr[3]) — the eclipse code turns the Moon's into
 *          a semidiameter, which is what converts shadow geometry into a covered percentage. */
double w_pheno(double jd, int ipl, int which) {
  double attr[20]; char serr[256];
  if (swe_pheno_ut(jd, ipl, SEFLG_MOSEPH, attr, serr) < 0) return (which == 0) ? 99.0 : -1.0;
  if (which == 1) return attr[1];
  if (which == 2) return attr[3];
  return attr[4];
}

/* Next rise/set (JD UT) at/after jd of body ipl for geographic (lon,lat,alt_m). rise=1 → rise.
 * Default upper-limb + refraction = the standard -0.8333° horizon Skyfield uses (sunrise.py);
 * Swiss Eph also adds the Moon's parallax/semidiameter automatically for ipl=SE_MOON. */
double w_rise(double jd, double lon, double lat, double alt, int rise, int ipl) {
  double geopos[3] = { lon, lat, alt };
  double tret[10]; char serr[256];
  int rsmi = rise ? SE_CALC_RISE : SE_CALC_SET;
  if (swe_rise_trans(jd, ipl, NULL, SEFLG_MOSEPH, rsmi, geopos, 1013.25, 15.0, tret, serr) < 0)
    return -1.0;
  return tret[0];
}

/* ---------------------------------------------------------------------------
 * Eclipses (grahana).
 *
 * These Swiss Ephemeris calls return arrays (contact times, local circumstances),
 * which cwrap's double-only surface cannot carry. The wrapper therefore keeps one
 * static result pair — filled by a w_*_ecl_* call, read back with w_ecl_tret() /
 * w_ecl_attr(). Safe because JS is single-threaded and every caller does
 * "compute, then read" before the next compute (same contract as the global
 * sidereal mode set by w_set_sid_mode).
 *
 * Index maps (from swecl.c):
 *   lunar when   tret: 0 max, 2/3 partial begin/end, 4/5 totality begin/end,
 *                      6/7 penumbral begin/end
 *   solar when   tret: 0 max, 1..4 first..fourth contact, 5 sunrise, 6 sunset
 *   lunar attr:  0 umbral mag, 1 penumbral mag, 4 azimuth, 5 true alt, 6 app alt,
 *                7 distance from opposition, 9/10 saros series/member
 *   solar attr:  0 fraction of diameter covered, 1 lunar/solar diameter ratio,
 *                2 obscuration (fraction of disc), 3 core shadow km, 4 azimuth,
 *                5 true alt, 6 app alt, 7 elongation, 8 NASA magnitude,
 *                9/10 saros series/member
 * Return value is the SE_ECL_* retflag (0 = no eclipse, -1 = error). */
static double ecl_tret[10];
static double ecl_attr[20];

double w_ecl_tret(int i) { return (i < 0 || i > 9)  ? 0.0 : ecl_tret[i]; }
double w_ecl_attr(int i) { return (i < 0 || i > 19) ? 0.0 : ecl_attr[i]; }

static void ecl_clear(void) {
  int i;
  for (i = 0; i < 10; i++) ecl_tret[i] = 0.0;
  for (i = 0; i < 20; i++) ecl_attr[i] = 0.0;
}

/* Attributes of a lunar eclipse in progress at jd. use_geopos=0 → geocentric shadow
 * magnitudes regardless of the Moon's altitude (what the sky view needs to shade the
 * disc); use_geopos=1 → adds azimuth/altitude and returns 0 when the Moon is below
 * the horizon, i.e. "is this eclipse actually up for this observer". */
int w_lun_ecl_how(double jd, double lon, double lat, double alt, int use_geopos) {
  double geopos[3] = { lon, lat, alt }; char serr[256];
  ecl_clear();
  return swe_lun_eclipse_how(jd, SEFLG_MOSEPH, use_geopos ? geopos : NULL, ecl_attr, serr);
}

/* Next (backward=0) or previous (backward=1) lunar eclipse anywhere on Earth, from jd. */
int w_lun_ecl_when(double jd, int backward) {
  char serr[256];
  ecl_clear();
  return swe_lun_eclipse_when(jd, SEFLG_MOSEPH, 0, ecl_tret, backward, serr);
}

/* Next/previous lunar eclipse VISIBLE from (lon,lat,alt) — fills both tret and attr.
 * tret[5]/tret[6] carry moonrise/moonset when the eclipse straddles the horizon. */
int w_lun_ecl_when_loc(double jd, double lon, double lat, double alt, int backward) {
  double geopos[3] = { lon, lat, alt }; char serr[256];
  ecl_clear();
  return swe_lun_eclipse_when_loc(jd, SEFLG_MOSEPH, geopos, ecl_tret, ecl_attr, backward, serr);
}

/* Attributes of a solar eclipse at jd as seen from (lon,lat,alt) — 0 if none there. */
int w_sol_ecl_how(double jd, double lon, double lat, double alt) {
  double geopos[3] = { lon, lat, alt }; char serr[256];
  ecl_clear();
  return swe_sol_eclipse_how(jd, SEFLG_MOSEPH, geopos, ecl_attr, serr);
}

/* Next/previous solar eclipse visible from (lon,lat,alt) — local contact times. */
int w_sol_ecl_when_loc(double jd, double lon, double lat, double alt, int backward) {
  double geopos[3] = { lon, lat, alt }; char serr[256];
  ecl_clear();
  return swe_sol_eclipse_when_loc(jd, SEFLG_MOSEPH, geopos, ecl_tret, ecl_attr, backward, serr);
}

/* Next/previous solar eclipse anywhere on Earth (global contact times, tret[0]=max). */
int w_sol_ecl_when_glob(double jd, int backward) {
  char serr[256];
  ecl_clear();
  return swe_sol_eclipse_when_glob(jd, SEFLG_MOSEPH, 0, ecl_tret, backward, serr);
}

/* Where a solar eclipse is central/maximal at jd: ecl_tret[0]=lon, [1]=lat of the
 * shadow axis (attr as per w_sol_ecl_how). Lets the app say "totality is over X". */
int w_sol_ecl_where(double jd) {
  double geopos[2]; char serr[256];
  int32 r;
  ecl_clear();
  r = swe_sol_eclipse_where(jd, SEFLG_MOSEPH, geopos, ecl_attr, serr);
  if (r >= 0) { ecl_tret[0] = geopos[0]; ecl_tret[1] = geopos[1]; }
  return r;
}
