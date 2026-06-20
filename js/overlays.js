// overlays.js -- shared overlay geometry (Phase 7B). Pure math; both views consume it.
//
// Two coordinate regimes (this is the crux):
//   * Constellation lines / Messier are fixed to the stars -> J2000 equatorial vectors,
//     rendered with astro.starGroupMatrix (precession folded in).
//   * The ecliptic + sidereal Rashi band are defined of-date and must coincide with the
//     of-date planets -> equatorial-of-date vectors, rendered with astro.horizontalMatrix
//     only (NOT re-precessed). This keeps planets sitting on the ecliptic among the stars.

import * as astro from "./astro.js";

const D2R = Math.PI / 180;

export const RASHI_NAMES = [
  "Mesha", "Vrishabha", "Mithuna", "Karka", "Simha", "Kanya",
  "Tula", "Vrischika", "Dhanu", "Makara", "Kumbha", "Meena",
];

// IAU 88-constellation abbreviation -> full name (for centroid labels).
export const CONSTELLATION_NAMES = {
  And: "Andromeda", Ant: "Antlia", Aps: "Apus", Aqr: "Aquarius", Aql: "Aquila", Ara: "Ara",
  Ari: "Aries", Aur: "Auriga", Boo: "Bootes", Cae: "Caelum", Cam: "Camelopardalis",
  Cnc: "Cancer", CVn: "Canes Venatici", CMa: "Canis Major", CMi: "Canis Minor",
  Cap: "Capricornus", Car: "Carina", Cas: "Cassiopeia", Cen: "Centaurus", Cep: "Cepheus",
  Cet: "Cetus", Cha: "Chamaeleon", Cir: "Circinus", Col: "Columba", Com: "Coma Berenices",
  CrA: "Corona Australis", CrB: "Corona Borealis", Crv: "Corvus", Crt: "Crater", Cru: "Crux",
  Cyg: "Cygnus", Del: "Delphinus", Dor: "Dorado", Dra: "Draco", Equ: "Equuleus",
  Eri: "Eridanus", For: "Fornax", Gem: "Gemini", Gru: "Grus", Her: "Hercules",
  Hor: "Horologium", Hya: "Hydra", Hyi: "Hydrus", Ind: "Indus", Lac: "Lacerta", Leo: "Leo",
  LMi: "Leo Minor", Lep: "Lepus", Lib: "Libra", Lup: "Lupus", Lyn: "Lynx", Lyr: "Lyra",
  Men: "Mensa", Mic: "Microscopium", Mon: "Monoceros", Mus: "Musca", Nor: "Norma",
  Oct: "Octans", Oph: "Ophiuchus", Ori: "Orion", Pav: "Pavo", Peg: "Pegasus", Per: "Perseus",
  Phe: "Phoenix", Pic: "Pictor", Psc: "Pisces", PsA: "Piscis Austrinus", Pup: "Puppis",
  Pyx: "Pyxis", Ret: "Reticulum", Sge: "Sagitta", Sgr: "Sagittarius", Sco: "Scorpius",
  Scl: "Sculptor", Sct: "Scutum", Ser: "Serpens", Sex: "Sextans", Tau: "Taurus",
  Tel: "Telescopium", Tri: "Triangulum", TrA: "Triangulum Australe", Tuc: "Tucana",
  UMa: "Ursa Major", UMi: "Ursa Minor", Vel: "Vela", Vir: "Virgo", Vol: "Volans",
  Vul: "Vulpecula",
};

// Constellation centroid labels -> [{name, vec(J2000)}] (average of the figure's stars).
export function constellationLabels(cons, starMap) {
  const out = [];
  for (const ab in cons) {
    let x = 0, y = 0, z = 0, n = 0;
    const seen = new Set();
    for (const [a, b] of cons[ab]) {
      for (const h of [a, b]) {
        if (seen.has(h)) continue;
        seen.add(h);
        const v = starMap.get(h);
        if (v) { x += v[0]; y += v[1]; z += v[2]; n++; }
      }
    }
    if (!n) continue;
    const len = Math.hypot(x, y, z) || 1;
    out.push({ name: CONSTELLATION_NAMES[ab] || ab, vec: [x / len, y / len, z / len] });
  }
  return out;
}

function obliquity(jd) {
  const T = (jd - 2451545.0) / 36525.0;
  return (23.439291 - 0.0130042 * T) * D2R;
}

// Ecliptic (lon, lat in deg) -> equatorial-of-date unit vector.
export function eclipticToEqVec(lonDeg, jd, latDeg = 0) {
  const l = lonDeg * D2R, b = latDeg * D2R, e = obliquity(jd);
  const cb = Math.cos(b), sb = Math.sin(b), cl = Math.cos(l), sl = Math.sin(l);
  const ce = Math.cos(e), se = Math.sin(e);
  return [cb * cl, cb * sl * ce - sb * se, cb * sl * se + sb * ce];
}

// hip -> J2000 equatorial unit vector, from a /api/stars payload.
export function buildStarMap(starsData) {
  const m = new Map();
  for (const s of starsData.stars) m.set(s[0], astro.raDecToVec(s[1], s[2]));
  return m;
}

// Flat [x,y,z, x,y,z, ...] vertex pairs (J2000) for every drawable constellation segment.
// Segments referencing a star absent from the catalog (e.g. HIP 55203) are skipped.
export function constellationVerts(cons, starMap) {
  const v = [];
  for (const ab in cons) {
    for (const [a, b] of cons[ab]) {
      const va = starMap.get(a), vb = starMap.get(b);
      if (va && vb) v.push(va[0], va[1], va[2], vb[0], vb[1], vb[2]);
    }
  }
  return v;
}

// Messier objects -> [{id, name, type, mag, vec(J2000)}]. Fixed to the stars (J2000 group).
export function messierVecs(messierData) {
  return messierData.objects.map((o) => ({
    id: o[0], name: o[1], type: o[2], mag: o[5], raDeg: o[3], decDeg: o[4],
    vec: astro.raDecToVec(o[3], o[4]),
  }));
}

// Ecliptic polyline + 12 sidereal Rashi boundary ticks + segment-midpoint labels
// (equatorial-of-date vectors). Sidereal boundary k*30 -> tropical (k*30 + ayanamsa).
export function eclipticGeometry(ayanamsaDeg, jd) {
  const line = [];
  for (let lon = 0; lon <= 360; lon += 2) {
    const p = eclipticToEqVec(lon, jd);
    line.push(p[0], p[1], p[2]);
  }
  const ticks = [];
  const labels = [];
  for (let k = 0; k < 12; k++) {
    const trop = ((k * 30 + ayanamsaDeg) % 360 + 360) % 360;
    const a = eclipticToEqVec(trop, jd, -4), b = eclipticToEqVec(trop, jd, 4);
    ticks.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    const mid = ((k * 30 + 15 + ayanamsaDeg) % 360 + 360) % 360;
    labels.push({ name: RASHI_NAMES[k], vec: eclipticToEqVec(mid, jd) });
  }
  return { line, ticks, labels };
}
