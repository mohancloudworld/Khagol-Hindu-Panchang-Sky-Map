// Solar-system orrery positions — ports app/orrery.py. Heliocentric ecliptic-J2000 XYZ (AU)
// (Sun at origin; app uses barycentric, ~0.005 AU Sun-wobble difference, visually identical),
// heliocentric distance, and apparent geocentric ecliptic longitude -> rashi.
import * as swe from "./sweph.js";
import { RASHI } from "./names.js";

const DISPLAY = {
  sun: "Sun", mercury: "Mercury", venus: "Venus", earth: "Earth", mars: "Mars",
  jupiter: "Jupiter", saturn: "Saturn", uranus: "Uranus", neptune: "Neptune", moon: "Moon", pluto: "Pluto",
};
const ORDER = ["sun", "mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune", "moon", "pluto"];

function jdFromDate(dt) {
  const h = dt.getUTCHours() + dt.getUTCMinutes() / 60 + (dt.getUTCSeconds() + dt.getUTCMilliseconds() / 1000) / 3600;
  return swe.julday(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), h);
}
const norm360 = (x) => ((x % 360) + 360) % 360;

export function computeOrrery(dtUTC, ayanamsa = "lahiri") {
  const jd = jdFromDate(dtUTC);
  const ayan = swe.ayanamsaDeg(jd, ayanamsa);
  const bodies = ORDER.map((bid) => {
    const [x, y, z] = swe.helioXYZ(jd, bid);
    const e = {
      id: bid, name: DISPLAY[bid],
      x: +x.toFixed(9), y: +y.toFixed(9), z: +z.toFixed(9),
      helio_au: +Math.hypot(x, y, z).toFixed(6), dwarf: bid === "pluto", rashi_geocentric: null,
    };
    if (bid !== "earth") {
      const glon = norm360(swe.eclLon(jd, bid));   // apparent geocentric tropical ecliptic lon
      const sidereal = norm360(glon - ayan);
      e.rashi_geocentric = RASHI[Math.floor(sidereal / 30)];
      e.geo_lon = +glon.toFixed(5);
    }
    return e;
  });
  return {
    time_utc: dtUTC.toISOString().replace(/\.\d+Z$/, "Z"),
    ayanamsa, ayanamsa_deg: +ayan.toFixed(4), bodies,
  };
}

// Orbit trails: 256 ecliptic-of-date points per body over ±half-period around the month's 15th.
// Heliocentric (consistent with computeOrrery); the Moon trail is stored relative to Earth.
const ORRERY_PERIODS = {
  mercury: 87.969, venus: 224.701, earth: 365.256, mars: 686.980, jupiter: 4332.59,
  saturn: 10759.2, uranus: 30688.5, neptune: 60182.0, moon: 27.3217, pluto: 90560.0,
};
export function computeTrails(dtUTC, _ayanamsa = "lahiri") {
  const center = Date.UTC(dtUTC.getUTCFullYear(), dtUTC.getUTCMonth(), 15);
  const SPAN_MIN = Date.UTC(1849, 0, 1), SPAN_MAX = Date.UTC(2149, 11, 31);
  const trails = {};
  for (const [bid, period] of Object.entries(ORRERY_PERIODS)) {
    const halfMs = (period / 2) * 86400000, pts = [];
    for (let i = 0; i < 256; i++) {
      const ms = Math.min(Math.max(center - halfMs + 2 * halfMs * (i / 255), SPAN_MIN), SPAN_MAX);
      const jd = ms / 86400000 + 2440587.5;
      if (bid === "moon") {
        const m = swe.helioXYZ(jd, "moon"), e = swe.helioXYZ(jd, "earth");
        pts.push([+(m[0] - e[0]).toFixed(6), +(m[1] - e[1]).toFixed(6), +(m[2] - e[2]).toFixed(6)]);
      } else {
        const x = swe.helioXYZ(jd, bid);
        pts.push([+x[0].toFixed(6), +x[1].toFixed(6), +x[2].toFixed(6)]);
      }
    }
    trails[bid] = pts;
  }
  return { trails, relative: { moon: "earth" } };
}
