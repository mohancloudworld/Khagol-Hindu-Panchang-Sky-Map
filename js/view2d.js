// view2d.js -- 2D stereographic dome (Phase 7). Canvas2D, shares state + data with 3D.
//
// Projection: stereographic from the nadir, zenith at canvas centre, horizon a circle.
// Star alt/az come from the SAME astro.starGroupMatrix as the 3D view, so a star lands in
// a consistent place in both views (only the projection differs).

import * as astro from "./astro.js";
import * as overlays from "./overlays.js";
import * as i18n from "./i18n.js";

const PLANET_COLOR = {
  sun: "#ffd24a", moon: "#e8e8d8", mercury: "#b0a08f", venus: "#e8d8a0",
  mars: "#d06a40", jupiter: "#d8b890", saturn: "#d8c890", uranus: "#a0d0d0", neptune: "#6080d0",
};

export function createView2D(container) {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;touch-action:none";
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0, H = 0, cx = 0, cy = 0, R0 = 1;
  let zoom = 1, rotation = 0, gridOn = false;
  // Smooth arrow-key navigation: ←→ rotate the dome, ↑↓ zoom in/out (the dome is top-down, no tilt).
  const heldKeys = new Set();
  let keyLast = 0;
  function applyKeyNav() {
    if (!heldKeys.size) { keyLast = 0; return; }
    const now = performance.now();
    const dt = keyLast ? Math.min(0.05, (now - keyLast) / 1000) : 1 / 60;
    keyLast = now;
    if (heldKeys.has("ArrowLeft")) rotation -= 1.1 * dt;
    if (heldKeys.has("ArrowRight")) rotation += 1.1 * dt;
    if (heldKeys.has("ArrowUp")) zoom = Math.min(8, zoom * (1 + 0.9 * dt));
    if (heldKeys.has("ArrowDown")) zoom = Math.max(0.3, zoom / (1 + 0.9 * dt));
  }
  let starVec = null, starMag = null, starName = null;   // J2000 unit vectors + mag
  let sky = null;
  let constVerts = null, constLabels = null, eclGeom = null, messier = null; // overlay data
  const show = { constellations: false, rashi: false, messier: false, stars: true };
  let starsRaw = null, lastM = null, lastH = null, lastAtmos = true, selected = null, lastSimMs = 0;
  let starLabelList = null;              // [{idx,name,zodiac}] -- Hindu-astrology stars to label
  const STAR_LABEL_COL = "#e2e9ff", ZODIAC_LABEL_COL = "#f0c060";
  // Deep-time star drift (uniform precession + proper motion); off by default.
  let starP0 = null, starV3d = null, starBaseVec = null, deepOn = false, deepEpoch = 2000, lastCons = null;
  const D2R = Math.PI / 180, MAS2RAD = Math.PI / (180 * 3600 * 1000), KMS2PCYR = 1.0227121e-6;

  // Extrapolate a body's of-date ra/dec from the last fetch by its angular rate (true per-frame
  // model) so orbital drift is smooth every frame; the matrix adds the diurnal spin.
  function bodyVec(b) {
    const dtHr = (sky && sky._fetchMs != null) ? (lastSimMs - sky._fetchMs) / 3600000 : 0;
    const ra = b.ra_hours * 15 + (b.ra_rate_dph || 0) * dtHr;
    const dec = b.dec_deg + (b.dec_rate_dph || 0) * dtHr;
    return astro.raDecToVec(ra, dec);
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = container.clientWidth; H = container.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = W / 2; cy = H / 2; R0 = Math.min(cx, cy) * 0.95;
  }
  resize();

  function setStars(starsData) {
    const arr = starsData.stars;
    starsRaw = arr;
    starVec = new Float32Array(arr.length * 3);
    starMag = new Float32Array(arr.length);
    starName = new Array(arr.length);
    starP0 = new Float64Array(arr.length * 3);
    starV3d = new Float64Array(arr.length * 3);
    for (let i = 0; i < arr.length; i++) {
      const s = arr[i], ra = s[1] * D2R, dec = s[2] * D2R;
      const v = astro.raDecToVec(s[1], s[2]);
      starVec[3 * i] = v[0]; starVec[3 * i + 1] = v[1]; starVec[3 * i + 2] = v[2];
      starMag[i] = s[3]; starName[i] = s[4];
      const eRA = [-Math.sin(ra), Math.cos(ra), 0];
      const eDec = [-Math.sin(dec) * Math.cos(ra), -Math.sin(dec) * Math.sin(ra), Math.cos(dec)];
      const plx = s[7] || 0, dist = plx > 0 ? 1000 / plx : 1.0;
      const muA = (s[5] || 0) * MAS2RAD, muD = (s[6] || 0) * MAS2RAD, vr = plx > 0 ? (s[8] || 0) * KMS2PCYR : 0;
      for (let k = 0; k < 3; k++) {
        starP0[i * 3 + k] = v[k] * dist;
        starV3d[i * 3 + k] = (muA * eRA[k] + muD * eDec[k]) * dist + vr * v[k];
      }
    }
    starBaseVec = starVec.slice();
    // Default star labels: stars relevant to Hindu astrology (shared 3-view policy). zodiac = an
    // on-ecliptic nakshatra star -> tinted gold while the rashi band is on.
    starLabelList = [];
    for (let i = 0; i < arr.length; i++) {
      const info = i18n.starLabelInfo(arr[i][4], astro.eclipticLatitude(arr[i][1], arr[i][2]));
      if (info) starLabelList.push({ idx: i, name: arr[i][4], zodiac: info.zodiac });
    }
    if (deepOn) setEpoch(deepEpoch);
  }

  function setSky(skyData) { sky = skyData; }

  function setOverlayData({ cons, starMap, ayanamsaDeg, jd, messier: m }) {
    lastCons = cons;
    constVerts = overlays.constellationVerts(cons, deepOn ? _driftedStarMap(deepEpoch - 1991.25) : starMap);
    constLabels = overlays.constellationLabels(cons, starMap);
    eclGeom = overlays.eclipticGeometry(ayanamsaDeg, jd);       // of-date vectors
    messier = m || null;
  }

  // HIP -> drifted equatorial unit vector at dt (years from J1991.25).
  function _driftedStarMap(dt) {
    const m = new Map();
    for (let i = 0; i < starsRaw.length; i++) {
      const j = i * 3;
      const x = starP0[j] + starV3d[j] * dt, y = starP0[j + 1] + starV3d[j + 1] * dt, z = starP0[j + 2] + starV3d[j + 2] * dt;
      const n = Math.hypot(x, y, z) || 1;
      m.set(starsRaw[i][0], [x / n, y / n, z / n]);
    }
    return m;
  }

  // Drift the stars + constellation lines to `year` CE (the dome redraws them via M each frame).
  function setEpoch(year) {
    deepEpoch = year;
    if (!starP0 || !starsRaw) return;
    const dt = year - 1991.25;
    for (let i = 0; i < starsRaw.length; i++) {
      const j = i * 3;
      const x = starP0[j] + starV3d[j] * dt, y = starP0[j + 1] + starV3d[j + 1] * dt, z = starP0[j + 2] + starV3d[j + 2] * dt;
      const inv = 1 / Math.hypot(x, y, z);
      starVec[j] = x * inv; starVec[j + 1] = y * inv; starVec[j + 2] = z * inv;
    }
    if (lastCons) constVerts = overlays.constellationVerts(lastCons, _driftedStarMap(dt));
  }

  // Deep-time mode: planets + rashi band are gated off in frame(); off -> restore J2000.
  function setDeepTime(on) {
    deepOn = on;
    if (on) { setEpoch(deepEpoch); return; }
    if (starBaseVec) starVec.set(starBaseVec);
    if (lastCons && starsRaw) constVerts = overlays.constellationVerts(lastCons, overlays.buildStarMap({ stars: starsRaw }));
  }

  // Refresh the of-date Rashi band after a sim-time change (drawn from eclGeom every frame).
  function setEcliptic(ayanamsaDeg, jd) {
    eclGeom = overlays.eclipticGeometry(ayanamsaDeg, jd);
  }

  // Transform a unit vector by a row-major 3x3, return projected screen point (or null).
  function projVec(Mat, x, y, z, atmosphere) {
    const wx = Mat[0] * x + Mat[1] * y + Mat[2] * z;
    const wy = Mat[3] * x + Mat[4] * y + Mat[5] * z;
    const wz = Mat[6] * x + Mat[7] * y + Mat[8] * z;
    const [alt, az] = vecToAltAz(wx, wy, wz);
    return project(alt, az, atmosphere);
  }

  function drawMessier(M, atmosphere) {
    if (!messier) return;
    const r = 3.2, showLabels = zoom > 2.5;
    ctx.strokeStyle = "#9ad0c0"; ctx.lineWidth = 1.2;
    ctx.fillStyle = "#9ad0c0"; ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    for (const o of messier) {
      const p = projVec(M, o.vec[0], o.vec[1], o.vec[2], atmosphere); if (!p) continue;
      ctx.beginPath();                        // diamond marker
      ctx.moveTo(p[0], p[1] - r); ctx.lineTo(p[0] + r, p[1]);
      ctx.lineTo(p[0], p[1] + r); ctx.lineTo(p[0] - r, p[1]); ctx.closePath(); ctx.stroke();
      if (showLabels) ctx.fillText("M" + o.id, p[0], p[1] - r - 1);
    }
  }

  function drawConstellations(M, atmosphere) {
    if (!constVerts) return;
    ctx.strokeStyle = "rgba(72,112,176,0.5)"; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < constVerts.length; i += 6) {
      const a = projVec(M, constVerts[i], constVerts[i + 1], constVerts[i + 2], atmosphere);
      const b = projVec(M, constVerts[i + 3], constVerts[i + 4], constVerts[i + 5], atmosphere);
      if (a && b) { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    }
    ctx.stroke();
    if (constLabels) {
      ctx.fillStyle = "#6f8fc8"; ctx.font = "12px system-ui, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (const lab of constLabels) {
        const p = projVec(M, lab.vec[0], lab.vec[1], lab.vec[2], atmosphere);
        if (p) ctx.fillText(lab.name, p[0], p[1]);
      }
    }
  }

  function drawEcliptic(H, atmosphere) {
    if (!eclGeom) return;
    ctx.strokeStyle = "rgba(224,169,58,0.55)"; ctx.lineWidth = 1.2;
    ctx.beginPath();
    let started = false;
    const L = eclGeom.line;
    for (let i = 0; i < L.length; i += 3) {
      const p = projVec(H, L[i], L[i + 1], L[i + 2], atmosphere);
      if (!p) { started = false; continue; }
      started ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); started = true;
    }
    ctx.stroke();
    const T = eclGeom.ticks;
    ctx.beginPath();
    for (let i = 0; i < T.length; i += 6) {
      const a = projVec(H, T[i], T[i + 1], T[i + 2], atmosphere);
      const b = projVec(H, T[i + 3], T[i + 4], T[i + 5], atmosphere);
      if (a && b) { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    }
    ctx.stroke();
    ctx.fillStyle = "#e0a93a"; ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const lab of eclGeom.labels) {
      const p = projVec(H, lab.vec[0], lab.vec[1], lab.vec[2], atmosphere);
      if (p) ctx.fillText(lab.name, p[0], p[1]);
    }
  }

  // alt/az (deg) -> screen point, or null when clipped. Atmosphere ON refracts and clips at
  // the horizon; OFF (space view) renders the full sphere past the horizon (Section 7C).
  function project(altDeg, azDeg, atmosphere) {
    const alt = atmosphere ? astro.refract(altDeg) : altDeg;
    if (alt < (atmosphere ? -1 : -89)) return null;
    const r = R0 * zoom * Math.tan((90 - alt) * Math.PI / 360);   // tan((90-alt)/2)
    if (r > Math.min(cx, cy) * 6) return null;                    // far off-screen
    const th = azDeg * Math.PI / 180 + rotation;
    return [cx - r * Math.sin(th), cy - r * Math.cos(th)];        // N up, E left (sky-correct)
  }

  // Horizontal vector (x East, y Up, z South) -> alt/az degrees.
  function vecToAltAz(x, y, z) {
    const alt = Math.asin(Math.max(-1, Math.min(1, y))) * 180 / Math.PI;
    const az = (Math.atan2(x, -z) * 180 / Math.PI + 360) % 360;
    return [alt, az];
  }

  function drawHorizonAndCardinals() {
    const r0 = R0 * zoom;
    ctx.strokeStyle = "#3a4a66"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, r0, 0, 2 * Math.PI); ctx.stroke();
    // degree ticks every 10 deg azimuth
    ctx.strokeStyle = "#2a3a55";
    for (let az = 0; az < 360; az += 10) {
      const th = az * Math.PI / 180 + rotation;
      const big = az % 90 === 0;
      const r1 = r0 - (big ? 10 : 5);
      ctx.beginPath();
      ctx.moveTo(cx - r0 * Math.sin(th), cy - r0 * Math.cos(th));
      ctx.lineTo(cx - r1 * Math.sin(th), cy - r1 * Math.cos(th));
      ctx.stroke();
    }
    ctx.fillStyle = "#8fa0c0"; ctx.font = "14px system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const [t, az] of [["N", 0], ["E", 90], ["S", 180], ["W", 270]]) {
      const th = az * Math.PI / 180 + rotation, r = r0 + 14;
      ctx.fillText(t, cx - r * Math.sin(th), cy - r * Math.cos(th));
    }
    // Name the key parts of the dome so the view is self-explanatory.
    ctx.fillStyle = "#5a6a8a"; ctx.font = "11px system-ui, sans-serif";
    ctx.fillText("zenith (overhead)", cx, cy - 13);
    ctx.fillText("horizon", cx, cy + r0 - 13);
  }

  function drawGrid(atmosphere) {
    ctx.strokeStyle = "rgba(34,68,102,0.4)"; ctx.lineWidth = 1;
    for (let alt = 0; alt <= 80; alt += 30) {           // almucantars
      ctx.beginPath();
      for (let az = 0; az <= 360; az += 6) {
        const p = project(alt, az, atmosphere); if (!p) continue;
        az === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]);
      }
      ctx.stroke();
    }
    for (let az = 0; az < 360; az += 30) {              // meridians
      ctx.beginPath();
      for (let alt = 0; alt <= 88; alt += 4) {
        const p = project(alt, az, atmosphere); if (!p) continue;
        alt === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]);
      }
      ctx.stroke();
    }
  }

  // Glyph magnification so wheel zoom visibly enlarges objects, not just spreads them.
  function glyphZoom() { return Math.min(3, Math.max(0.6, Math.sqrt(zoom))); }

  function drawStars(M, atmosphere, dayFactor) {
    if (!starVec || !show.stars) return;
    const gz = glyphZoom();
    const n = starMag.length;
    for (let i = 0; i < n; i++) {
      const x = starVec[3 * i], y = starVec[3 * i + 1], z = starVec[3 * i + 2];
      const wx = M[0] * x + M[1] * y + M[2] * z;
      const wy = M[3] * x + M[4] * y + M[5] * z;
      const wz = M[6] * x + M[7] * y + M[8] * z;
      const [alt, az] = vecToAltAz(wx, wy, wz);
      const p = project(alt, az, atmosphere); if (!p) continue;
      const mag = starMag[i];
      const rad = Math.max(0.5, Math.min(7, 4.5 * Math.pow(10, -0.15 * mag))) * gz;
      let a = Math.max(0.05, Math.min(1, 1.2 - 0.16 * mag)) * dayFactor;
      if (!atmosphere && alt < 0) a *= 0.6;        // dim sub-horizon objects in space view
      ctx.globalAlpha = a;
      ctx.beginPath(); ctx.arc(p[0], p[1], rad, 0, 2 * Math.PI);
      ctx.fillStyle = "#eef2ff"; ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Persistent names for the Hindu-astrology stars (mirrors the orrery). Gold for on-ecliptic
  // nakshatra stars while the rashi band is on; cool white otherwise.
  function drawStarLabels(M, atmosphere) {
    if (!starLabelList || !starVec || !show.stars) return;
    const gz = glyphZoom();
    const gold = show.rashi && !deepOn;
    ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.font = "600 11px system-ui, sans-serif";
    // Dark halo so the name reads over the starfield (matches the orrery / 3D labels).
    ctx.shadowColor = "rgba(0,0,0,0.85)"; ctx.shadowBlur = 3;
    for (const e of starLabelList) {
      const i = e.idx;
      // The selected star is drawn in orange by drawSelected -- skip its persistent label so the two
      // don't stack (one white/gold, one orange).
      if (selected && selected._starIdx === i) continue;
      const x = starVec[3 * i], y = starVec[3 * i + 1], z = starVec[3 * i + 2];
      const wx = M[0] * x + M[1] * y + M[2] * z;
      const wy = M[3] * x + M[4] * y + M[5] * z;
      const wz = M[6] * x + M[7] * y + M[8] * z;
      const [alt, az] = vecToAltAz(wx, wy, wz);
      const p = project(alt, az, atmosphere); if (!p) continue;
      const rad = Math.max(0.5, Math.min(7, 4.5 * Math.pow(10, -0.15 * starMag[i]))) * gz;
      ctx.fillStyle = (e.zodiac && gold) ? ZODIAC_LABEL_COL : STAR_LABEL_COL;
      ctx.fillText(i18n.objectName(e.name), p[0], p[1] - rad - 2 * gz);
    }
    ctx.shadowBlur = 0; ctx.shadowColor = "transparent";   // don't bleed the halo into later draws
  }

  function drawMoon(p, b, rad) {
    const k = (b.phase_percent ?? 50) / 100;
    ctx.save(); ctx.beginPath(); ctx.arc(p[0], p[1], rad, 0, 2 * Math.PI); ctx.clip();
    ctx.fillStyle = "#0a0a12"; ctx.fillRect(p[0] - rad, p[1] - rad, 2 * rad, 2 * rad);
    ctx.fillStyle = "#e8e8d8";
    ctx.beginPath();
    const x = rad * (1 - 2 * k);
    ctx.ellipse(p[0], p[1], Math.abs(x), rad, 0, 0, 2 * Math.PI);
    if (k > 0.5) { ctx.rect(p[0] - rad, p[1] - rad, 2 * rad, 2 * rad); }
    ctx.fill("evenodd");
    ctx.fillRect(p[0], p[1] - rad, rad, 2 * rad);     // lit right half (waxing approx)
    ctx.restore();
    ctx.strokeStyle = "#888"; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.arc(p[0], p[1], rad, 0, 2 * Math.PI); ctx.stroke();
  }

  function drawSaturn(p, rad) {
    ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(-0.42);
    ctx.strokeStyle = "#d8c890"; ctx.lineWidth = Math.max(1, rad * 0.32);
    ctx.beginPath(); ctx.ellipse(0, 0, rad * 2.1, rad * 0.72, 0, 0, 2 * Math.PI); ctx.stroke();
    ctx.restore();
    ctx.beginPath(); ctx.arc(p[0], p[1], rad, 0, 2 * Math.PI);
    ctx.fillStyle = "#e6d6a4"; ctx.fill();
  }

  function drawBodies(Hmat, atmosphere) {
    if (!sky) return;
    const gz = glyphZoom();
    ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.font = "600 11px system-ui, sans-serif";
    for (const b of sky.bodies) {
      // Of-date ra/dec through the SAME advanced-LST matrix as the Rashi band (keeps planets
      // locked to band/stars between fetches); project() then applies refraction like the stars.
      const rv = bodyVec(b);
      const w = _world(Hmat, rv[0], rv[1], rv[2]);
      const [alt, az] = vecToAltAz(w[0], w[1], w[2]);
      const p = project(alt, az, atmosphere); if (!p) continue;
      ctx.globalAlpha = (!atmosphere && alt < 0) ? 0.6 : 1;     // dim sub-horizon in space view
      const rad = (b.id === "sun" || b.id === "moon" ? 8 : 4) * gz;
      if (b.id === "moon") drawMoon(p, b, rad);
      else if (b.id === "saturn") drawSaturn(p, rad);
      else {
        ctx.beginPath(); ctx.arc(p[0], p[1], rad, 0, 2 * Math.PI);
        ctx.fillStyle = PLANET_COLOR[b.id] || "#ccccff"; ctx.fill();
      }
      // Same treatment as the star names (semibold, bright, dark halo) so body and star labels read
      // consistently -- the orrery does this too.
      ctx.fillStyle = "#e8eeff";
      ctx.shadowColor = "rgba(0,0,0,0.85)"; ctx.shadowBlur = 3;
      ctx.fillText(i18n.objectName(b.name), p[0], p[1] - rad - 2 * gz);   // name above the dot
      ctx.shadowBlur = 0; ctx.shadowColor = "transparent";
    }
    ctx.globalAlpha = 1;
  }

  // --- picking (Phase 8) ---------------------------------------------------
  function _world(M, x, y, z) {
    return [M[0] * x + M[1] * y + M[2] * z, M[3] * x + M[4] * y + M[5] * z, M[6] * x + M[7] * y + M[8] * z];
  }
  function bodyDescriptor(b) {
    return { kind: "body", name: b.name,
      type: b.id === "sun" ? "The Sun" : b.id === "moon" ? "The Moon" : "Planet",
      mag: b.mag, raDeg: b.ra_hours * 15, decDeg: b.dec_deg, alt: b.alt, altTrue: b.alt_true,
      az: b.az, distanceAu: b.distance_au, phasePercent: b.phase_percent, _bodyId: b.id };
  }
  function pickAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left, py = clientY - rect.top;
    let best = null, bestD = 11;     // <=10 px (Section 8 item 2)
    if (starsRaw && lastM) {
      for (let i = 0; i < starsRaw.length; i++) {
        const w = _world(lastM, starVec[3 * i], starVec[3 * i + 1], starVec[3 * i + 2]);
        const [alt, az] = vecToAltAz(w[0], w[1], w[2]);
        const p = project(alt, az, lastAtmos); if (!p) continue;
        const d = Math.hypot(p[0] - px, p[1] - py);
        if (d < bestD) {
          bestD = d; const s = starsRaw[i];
          best = { kind: "star", name: s[4] || undefined, hip: s[0], type: "Star", mag: s[3],
            raDeg: s[1], decDeg: s[2], alt, az, _ra: s[1], _dec: s[2], _starIdx: i };
        }
      }
    }
    if (sky && lastH) for (const b of sky.bodies) {
      const rv = bodyVec(b);
      const w = _world(lastH, rv[0], rv[1], rv[2]);
      const [alt, az] = vecToAltAz(w[0], w[1], w[2]);
      const p = project(alt, az, lastAtmos); if (!p) continue;
      const d = Math.hypot(p[0] - px, p[1] - py);
      if (d < bestD) { bestD = d; best = bodyDescriptor(b); }
    }
    if (messier && lastM) for (const m of messier) {
      const w = _world(lastM, m.vec[0], m.vec[1], m.vec[2]);
      const [alt, az] = vecToAltAz(w[0], w[1], w[2]);
      const p = project(alt, az, lastAtmos); if (!p) continue;
      const d = Math.hypot(p[0] - px, p[1] - py);
      if (d < bestD) {
        bestD = d;
        best = { kind: "messier", name: `M${m.id}${m.name ? " — " + m.name : ""}`, type: m.type,
          mag: m.mag, raDeg: m.raDeg, decDeg: m.decDeg, alt, az, _ra: m.raDeg, _dec: m.decDeg };
      }
    }
    return best;
  }
  function setSelected(desc) { selected = desc; }
  function findByName(name) {
    const lc = name.toLowerCase();
    if (sky) { const b = sky.bodies.find((x) => x.name.toLowerCase() === lc); if (b) return bodyDescriptor(b); }
    if (starsRaw) {
      const idx = starsRaw.findIndex((x) => x[4] && x[4].toLowerCase() === lc);
      if (idx >= 0) {
        const s = starsRaw[idx];
        let alt, az;
        if (lastM) {
          const w = _world(lastM, ...astro.raDecToVec(s[1], s[2]));
          [alt, az] = vecToAltAz(w[0], w[1], w[2]);
        }
        return { kind: "star", name: s[4], type: "Star", mag: s[3], raDeg: s[1], decDeg: s[2], alt, az, _ra: s[1], _dec: s[2], _starIdx: idx };
      }
    }
    return null;
  }
  // Selected star's rendered unit vector (starVec is the drifted buffer in deep time), else base.
  function _selStarVec(d) {
    if (d._starIdx != null && starVec) {
      const j = d._starIdx * 3; return [starVec[j], starVec[j + 1], starVec[j + 2]];
    }
    return astro.raDecToVec(d._ra, d._dec);
  }
  function drawSelected(atmosphere) {
    if (!selected) return;
    let p = null;
    if (selected._bodyId && sky && lastH) {
      const b = sky.bodies.find((x) => x.id === selected._bodyId);
      if (b) {
        const rv = bodyVec(b);
        const w = _world(lastH, rv[0], rv[1], rv[2]);
        const [alt, az] = vecToAltAz(w[0], w[1], w[2]);
        p = project(alt, az, atmosphere);
      }
    } else if (selected._ra != null && lastM) {
      const v = _selStarVec(selected);       // drifted in deep time -> stays on the star
      const w = _world(lastM, v[0], v[1], v[2]);
      const [alt, az] = vecToAltAz(w[0], w[1], w[2]);
      p = project(alt, az, atmosphere);
    }
    if (p) {
      // Size the ring to sit OUTSIDE the object's glyph -- the Sun/Moon disc grows with zoom and would
      // otherwise spill past a fixed 9px circle. Body glyph radius mirrors drawBodies(); stars stay small.
      let rr = 9;
      if (selected._bodyId) {
        const gz = glyphZoom();
        rr = (selected._bodyId === "sun" || selected._bodyId === "moon" ? 8 : 4) * gz + 4;
      }
      ctx.strokeStyle = "#33ddff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p[0], p[1], rr, 0, 2 * Math.PI); ctx.stroke();
      // Stars/DSOs carry no persistent name (only bodies do, drawn in drawBodies) -- so a searched
      // star would show just the ring. Draw its name in orange-red above the ring, matching the
      // orrery's search marker, so the picked object is identified in every view.
      if (!selected._bodyId && selected.name) {
        ctx.fillStyle = "#ff6a3d"; ctx.font = "600 12px system-ui, sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.fillText(i18n.objectName(selected.name), p[0], p[1] - rr - 3);
      }
    }
  }

  function frame(lstHours, latDeg, simDate, atmosphere = true) {
    applyKeyNav();
    const jdPrec = deepOn ? (2451545.0 + (deepEpoch - 2000) * 365.25) : astro.jdFromDate(simDate);
    const M = astro.starGroupMatrix(lstHours, latDeg, jdPrec, deepOn);
    const Hmat = astro.horizontalMatrix(lstHours, latDeg);
    lastM = M; lastH = Hmat; lastAtmos = atmosphere; lastSimMs = simDate.getTime();
    const sun = sky && sky.bodies.find((b) => b.id === "sun");
    const sunAlt = sun ? (atmosphere ? sun.alt : sun.alt_true) : -90;
    const day = atmosphere ? Math.max(0, Math.min(1, (sunAlt + 6) / 12)) : 0;
    const dayFactor = atmosphere ? 1 - Math.max(0, Math.min(1, (sunAlt + 2) / 8)) : 1;

    // sky background tint
    const top = atmosphere ? lerpColor([5, 7, 15], [74, 120, 184], day) : [0, 0, 0];
    ctx.fillStyle = `rgb(${top[0]},${top[1]},${top[2]})`;
    ctx.fillRect(0, 0, W, H);

    if (gridOn) drawGrid(atmosphere);
    if (show.constellations) drawConstellations(M, atmosphere);
    if (show.messier && !deepOn) drawMessier(M, atmosphere);
    drawStars(M, atmosphere, dayFactor);
    // Deep time: planets/Sun/Moon + rashi band have no valid ephemeris far from now -> gate off.
    if (show.rashi && !deepOn) drawEcliptic(Hmat, atmosphere);
    if (!deepOn) drawBodies(Hmat, atmosphere);
    drawStarLabels(M, atmosphere);
    drawSelected(atmosphere);
    drawHorizonAndCardinals();
  }

  // --- input ---------------------------------------------------------------
  let dragging = false, lastX = 0, lastY = 0;
  canvas.addEventListener("pointerdown", (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointerup", (e) => { dragging = false; canvas.releasePointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    rotation += (e.clientX - lastX) * 0.005;       // drag rotates about the zenith
    lastX = e.clientX; lastY = e.clientY;
  });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    zoom = Math.max(0.3, Math.min(8, zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));   // 0.3 = pulled-back dome
  }, { passive: false });
  // Arrow-key navigation (active only while this view is showing; keyup always releases).
  const ARROWS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);
  window.addEventListener("keydown", (e) => { if (ARROWS.has(e.key) && !container.hidden) { e.preventDefault(); heldKeys.add(e.key); } });
  window.addEventListener("keyup", (e) => { if (ARROWS.has(e.key)) heldKeys.delete(e.key); });
  window.addEventListener("blur", () => heldKeys.clear());
  window.addEventListener("resize", resize);

  // Dome "focus": the centre is always the zenith, so the one meaningful DOF is azimuth.
  // Rotate so the selected object sits straight up (12 o'clock) from the zenith, the 2D
  // analogue of the 3D "centre on selection". (If it's below the horizon with atmosphere on,
  // it's still correctly hidden -- switch to Space view to see it.)
  // Returns the selection's current altitude (deg) so the caller can warn when it's below the
  // horizon -- a zenith-stereographic dome cannot show sub-horizon objects (they project to
  // infinity). Bodies use the of-date horizontal matrix; stars/Messier use the star matrix.
  function lookAtSelected() {
    if (!selected) return null;
    let w = null;
    if (selected._bodyId && sky && lastH) {
      const b = sky.bodies.find((x) => x.id === selected._bodyId);
      if (b) { const rv = bodyVec(b); w = _world(lastH, rv[0], rv[1], rv[2]); }
    } else if (selected._ra != null && lastM) {
      const rv = _selStarVec(selected);
      w = _world(lastM, rv[0], rv[1], rv[2]);
    }
    if (!w) return null;
    const [alt, az] = vecToAltAz(w[0], w[1], w[2]);
    rotation = -az * Math.PI / 180;     // bring it straight up from the zenith
    return alt;
  }

  return {
    setStars, setSky, setOverlayData, setEcliptic, frame, resize, setEpoch, setDeepTime,
    pickAt, setSelected, findByName, lookAtSelected,
    clearSelection: () => setSelected(null),   // clear the highlighted pick
    snapshot: () => canvas.toDataURL("image/png"),   // 2D canvas keeps its pixels (Phase 9D.4)
    toggleGrid: (v) => { gridOn = v; },
    toggleConstellations: (v) => { show.constellations = v; },
    toggleRashi: (v) => { show.rashi = v; },
    toggleMessier: (v) => { show.messier = v; },
    toggleStars: (v) => { show.stars = v; },   // hide the catalog stars (+ their labels) to focus on bodies
    toggleMilkyway: () => {},   // 2D dome skips the Milky Way texture (Section 7B.3)
    setVisible: (v) => { canvas.style.display = v ? "block" : "none"; },
    // The dome is top-down (always centred on the zenith), so orientation = the azimuth (degrees,
    // 0°=N) currently pointing "up" on screen, plus the zoom. Reference: North up, zoom 1x.
    getOrientation() {
      const upAz = ((-rotation * 180 / Math.PI) % 360 + 360) % 360;
      return `Up ${upAz.toFixed(1)}° · Zoom ${zoom.toFixed(2)}×`;
    },
    // exposed for headless consistency tests
    _project: project, _vecToAltAz: vecToAltAz,
  };
}

function lerpColor(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t].map(Math.round);
}
