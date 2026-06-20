/* swe_wasm.c — thin wrapper exposing just the Swiss Ephemeris calls the extension needs,
 * forced to Moshier mode (SEFLG_MOSEPH → no ephemeris data files, fully self-contained).
 * Whole-sign houses ('W') for the lagna. Compiled to WASM by build-wasm.sh.
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

/* Apparent magnitude / illuminated fraction via swe_pheno_ut. which 0=mag 1=phase(0..1). */
double w_pheno(double jd, int ipl, int which) {
  double attr[20]; char serr[256];
  if (swe_pheno_ut(jd, ipl, SEFLG_MOSEPH, attr, serr) < 0) return (which == 0) ? 99.0 : -1.0;
  return (which == 0) ? attr[4] : attr[1];   /* attr[4]=app. magnitude, attr[1]=illum. fraction */
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
