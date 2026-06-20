// orrery.js -- Solar System space view (Phase 7D). Three.js, own renderer.
//
// Camera floats at a free barycentric point; the solar system orbits before it. Body
// distances are true to scale (AU = world unit in linear mode); body sizes are NOT (a
// true-scale planet is sub-pixel) -- spheres are scaled per-frame to a fixed screen size.
// Stars sit on a far background sphere (their directions are the same from anywhere in the
// solar system, parallax < 1").

import * as THREE from "../vendor/three.module.js";
import * as i18n from "./i18n.js";
import { matVec, eclipticPrecessionMatrix, eclipticLatitude } from "./astro.js";

// Approx fractional year (CE) from an ISO instant -- precession is ~50"/yr, so day precision is plenty.
function yearOfIso(iso) { const d = new Date(iso); return d.getUTCFullYear() + (d.getUTCMonth() * 30.44 + d.getUTCDate()) / 365.25; }
// JD at the start of a (fractional) CE year, for the precession matrix.
const jdOfYear = (year) => 2451545.0 + (year - 2000.0) * 365.25;

const D2R = Math.PI / 180;
const OBLIQUITY = 23.4393 * D2R;

const COLOR = {
  sun: 0xffcc33, mercury: 0xb0a08f, venus: 0xe8d8a0, earth: 0x5b9bd5, mars: 0xd06a40,
  jupiter: 0xd8b890, saturn: 0xd8c890, uranus: 0xa0d0d0, neptune: 0x6080d0,
  moon: 0xcccccc, pluto: 0xb0a090,
};
// Vedic graha names for the rashi labels (so a line reads "Chandra · Meena"); the modern
// planets have no classical graha name, so they fall back to their English name.
const GRAHA = {
  sun: "Surya", moon: "Chandra", mars: "Mangala", mercury: "Budha",
  jupiter: "Guru", venus: "Shukra", saturn: "Shani",
};
// Fixed angular sizes (multiplied by distance-to-camera each frame).
const SIZE = {
  sun: 0.010, jupiter: 0.0055, saturn: 0.005, uranus: 0.0045, neptune: 0.0045,
  earth: 0.0035, venus: 0.0035, mars: 0.003, mercury: 0.0028, moon: 0.0022, pluto: 0.0028,
};
const MOON_EXAGGERATION = 30;     // Earth-Moon separation x30 in linear mode (Section 7D.2)
const PERIOD_DAYS = {
  mercury: 87.969, venus: 224.701, earth: 365.256, mars: 686.980, jupiter: 4332.59,
  saturn: 10759.2, uranus: 30688.5, neptune: 60182.0, moon: 27.3217, pluto: 90560.0,
};

// Equatorial J2000 (RA/Dec deg) -> ecliptic unit vector (the orrery's frame).
function raDecToEcliptic(raDeg, decDeg) {
  const ra = raDeg * D2R, dec = decDeg * D2R;
  const x = Math.cos(dec) * Math.cos(ra), y = Math.cos(dec) * Math.sin(ra), z = Math.sin(dec);
  return [x, y * Math.cos(OBLIQUITY) + z * Math.sin(OBLIQUITY),
    -y * Math.sin(OBLIQUITY) + z * Math.cos(OBLIQUITY)];
}

export function createOrrery(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x01020a);
  const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.001, 5000);

  // --- orbit controls (orbit a target, dolly) ------------------------------
  const target = new THREE.Vector3(0, 0, 0);  // orbit pivot (the Sun, or a followed body)
  let followId = null;                         // id of the body the camera is following
  let radius = 40, az = 0, pol = 0.9;         // start tilted (not straight-down) for a 3D look
  const heldKeys = new Set();                  // arrow keys currently down (smooth orbit)
  let keyLast = 0;
  function applyCamera() {
    pol = Math.max(0.0001, Math.min(Math.PI - 0.0001, pol));
    radius = Math.max(0.5, Math.min(600, radius));   // zoom out far enough to frame the whole sky sphere
    camera.position.set(
      target.x + radius * Math.sin(pol) * Math.sin(az),
      target.y + radius * Math.sin(pol) * Math.cos(az),
      target.z + radius * Math.cos(pol),
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
  }

  let scaleMode = "linear";
  function scaleVec(x, y, z) {
    if (scaleMode === "log") {
      const r = Math.hypot(x, y, z) || 1e-9;
      const k = Math.log(1 + r) / r;
      return [x * k, y * k, z * k];
    }
    return [x, y, z];
  }

  // --- bodies + labels -----------------------------------------------------
  const bodyMeshes = new Map();
  const bodyLabels = new Map();
  let lastData = null;

  // The canvas auto-sizes its WIDTH to the text at a FIXED font, so long names (e.g. the Hindu
  // "Purva Bhadrapada") fit without shrinking the font or clipping. tex carries the aspect ratio;
  // sizeLabel() sets the sprite by HEIGHT so the text renders at a consistent size, any length.
  const _measCtx = document.createElement("canvas").getContext("2d");
  function labelTexture(text, color) {
    const dpr = 2, fontPx = 20 * dpr, padX = 9 * dpr, h = 32 * dpr;
    const font = `600 ${fontPx}px system-ui, sans-serif`;   // semibold reads clearer on the star field
    _measCtx.font = font;
    const tw = Math.ceil(_measCtx.measureText(text).width);
    const c = document.createElement("canvas");
    c.width = Math.max(16, tw + padX * 2); c.height = h;
    const g = c.getContext("2d");
    g.font = font; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = color;
    // Dark halo so the name stays legible over the bright Milky Way / dense stars, then a crisp
    // second pass over the glow so the core stays sharp.
    g.shadowColor = "rgba(0,0,0,0.85)"; g.shadowBlur = 4 * dpr;
    g.fillText(text, c.width / 2, h / 2);
    g.shadowBlur = 0; g.fillText(text, c.width / 2, h / 2);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    tex.userData = { aspect: c.width / c.height };
    return tex;
  }
  function labelSprite(text, color) {
    const tex = labelTexture(text, color);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.userData.lbl = { color, aspect: tex.userData.aspect };   // for re-baking + height-based sizing
    return s;
  }
  // Set a label's world HEIGHT; width follows the text's aspect so the font size is constant.
  function sizeLabel(sprite, hgt) {
    sprite.userData.lbl.h = hgt;
    sprite.scale.set(hgt * sprite.userData.lbl.aspect, hgt, 1);
  }
  function setLabelText(sprite, text) {
    const lbl = sprite.userData.lbl;
    const tex = labelTexture(text, lbl.color);
    if (sprite.material.map) sprite.material.map.dispose();
    sprite.material.map = tex; sprite.material.needsUpdate = true;
    lbl.aspect = tex.userData.aspect;
    if (lbl.h != null) sizeLabel(sprite, lbl.h);   // re-apply size with the new text's aspect
  }

  // Cyan ring drawn on the searched star's DOT (matches the 2D/3D selection highlight) so the
  // highlighted star is unmistakable in the field, not just named. A hollow circle reads as "this one".
  // Cyan (not the orange-red of the label) so the ring and the name on top of it stay legible apart.
  function ringTexture(size = 64) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    g.strokeStyle = "#33ddff"; g.lineWidth = size * 0.06;
    g.beginPath(); g.arc(size / 2, size / 2, size * 0.36, 0, 2 * Math.PI); g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const _ringTex = ringTexture();
  function ringSprite() {
    return new THREE.Sprite(new THREE.SpriteMaterial({ map: _ringTex, depthTest: false, transparent: true }));
  }

  function setData(data) {
    lastData = data;
    for (const b of data.bodies) {
      if (!bodyMeshes.has(b.id)) {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(1, 24, 16),
          new THREE.MeshBasicMaterial({ color: COLOR[b.id] || 0xffffff }),
        );
        mesh.userData.body = b;
        scene.add(mesh);
        bodyMeshes.set(b.id, mesh);
        const lab = labelSprite(i18n.objectName(b.name), "#e8eeff");
        lab.userData.src = b.name;       // English source name, for re-baking on a language change
        sizeLabel(lab, 0.015);           // sized per-frame too
        scene.add(lab);
        bodyLabels.set(b.id, lab);
      }
      bodyMeshes.get(b.id).userData.body = b;
    }
    // Track the sim date so the star field is precessed into the SAME of-date frame as the bodies
    // + Rashi band (without this the J2000 stars sit ~0.36 deg off the of-date overlay at 2026).
    if (data.time_utc) { regularYear = yearOfIso(data.time_utc); if (!deepTime) setEpoch(regularYear); }
    // Earth moved -> rebuild the Earth-centered dial + re-aim the Earth-vantage lines.
    if (rashiOn) { rebuildRashiBand(); rebuildRashiSight(); rebuildSpicaAxis(); }
  }

  // Render-space position of a body (AU/log scaled). Moon is exaggerated around Earth.
  function bodyRenderPos(b) {
    if (b.id === "moon" && lastData) {
      const e = lastData.bodies.find((x) => x.id === "earth");
      if (e) {
        const ex = scaleVec(e.x, e.y, e.z);
        const f = scaleMode === "linear" ? MOON_EXAGGERATION : 1;
        return new THREE.Vector3(ex[0] + (b.x - e.x) * f, ex[1] + (b.y - e.y) * f, ex[2] + (b.z - e.z) * f);
      }
    }
    const s = scaleVec(b.x, b.y, b.z);
    return new THREE.Vector3(s[0], s[1], s[2]);
  }

  // --- trails --------------------------------------------------------------
  let trailGroup = new THREE.Group();
  scene.add(trailGroup);
  let lastTrails = null;
  function setTrails(resp) {
    lastTrails = resp;
    scene.remove(trailGroup);
    trailGroup = new THREE.Group();
    scene.add(trailGroup);
    for (const id in resp.trails) {
      const pts = resp.trails[id];
      const isMoon = resp.relative && resp.relative[id] === "earth";
      const pos = new Float32Array(pts.length * 3);
      for (let i = 0; i < pts.length; i++) {
        let p;
        if (isMoon) {
          const f = scaleMode === "linear" ? MOON_EXAGGERATION : 1;
          p = [pts[i][0] * f, pts[i][1] * f, pts[i][2] * f]; // relative to Earth (added each frame)
        } else {
          p = scaleVec(pts[i][0], pts[i][1], pts[i][2]);
        }
        pos[3 * i] = p[0]; pos[3 * i + 1] = p[1]; pos[3 * i + 2] = p[2];
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const line = new THREE.Line(geom, new THREE.LineBasicMaterial({
        color: COLOR[id] || 0x8888aa, transparent: true, opacity: 0.4,
      }));
      line.userData.relativeTo = isMoon ? "earth" : null;
      trailGroup.add(line);
    }
  }

  // --- star backdrop -------------------------------------------------------
  // Deep-time star drift (Tier 2: full 3D space motion). Each star is stored as a 3D position p0
  // (parsec) and 3D velocity v3d (pc/yr) in the inertial ecliptic frame, built from proper motion
  // (tangential) + parallax (distance) + radial velocity. The drifted direction is
  // normalize(p0 + v3d*dt), dt from the Hipparcos epoch J1991.25 -- this captures the perspective
  // slow-down AND distance change for approaching/receding stars. Stars with no parallax fall
  // back to a nominal 1 pc (distance cancels for tangential-only); rv=0 means radial unmodelled.
  const STAR_R = 1200, STAR_EPOCH0 = 1991.25;
  const MAS2RAD = Math.PI / (180 * 3600 * 1000);
  const KMS2PCYR = 1.0227121e-6;        // 1 km/s in parsec/year
  let starsRawO = null, starPoints = null, starP0 = null, starV3d = null, starPosBuf = null;
  let starEpoch = 2000;
  const starLabelSprites = [];          // named-star labels, kept for re-baking on a language change
  let starsOn = true;                   // catalog star field + labels (Stars toggle)

  function eqVecToEcl(v) {               // same equatorial->ecliptic rotation as raDecToEcliptic
    return [v[0], v[1] * Math.cos(OBLIQUITY) + v[2] * Math.sin(OBLIQUITY),
      -v[1] * Math.sin(OBLIQUITY) + v[2] * Math.cos(OBLIQUITY)];
  }

  function setStars(starsData) {
    const arr = starsData.stars;
    starsRawO = arr;
    const n = arr.length;
    starP0 = new Float64Array(n * 3);    // parsec
    starV3d = new Float64Array(n * 3);   // parsec / year
    starPosBuf = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const s = arr[i], ra = s[1] * D2R, dec = s[2] * D2R;
      const d = raDecToEcliptic(s[1], s[2]);
      const eRA = eqVecToEcl([-Math.sin(ra), Math.cos(ra), 0]);                       // +RA tangent
      const eDec = eqVecToEcl([-Math.sin(dec) * Math.cos(ra), -Math.sin(dec) * Math.sin(ra), Math.cos(dec)]); // +Dec
      const plx = s[7] || 0;
      const dist = plx > 0 ? 1000 / plx : 1.0;          // pc (nominal 1 if unknown -> cancels)
      const muA = (s[5] || 0) * MAS2RAD, muD = (s[6] || 0) * MAS2RAD;   // rad/yr
      const vr = plx > 0 ? (s[8] || 0) * KMS2PCYR : 0;  // radial pc/yr (only with a real distance)
      for (let k = 0; k < 3; k++) {
        starP0[i * 3 + k] = d[k] * dist;
        starV3d[i * 3 + k] = (muA * eRA[k] + muD * eDec[k]) * dist + vr * d[k];
        starPosBuf[i * 3 + k] = d[k] * STAR_R;
      }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(starPosBuf, 3));
    starPoints = new THREE.Points(geom, new THREE.PointsMaterial({ color: 0xeef2ff, size: 2.2, sizeAttenuation: false }));
    starPoints.frustumCulled = false;
    scene.add(starPoints);
    // Default labels: stars RELEVANT TO HINDU ASTROLOGY, i.e. those with a Hindu name -- the 27
    // nakshatra yogataras + Abhijit (Vega), the seven Saptarishi (Ursa Major), Dhruva (Polaris),
    // Agastya (Canopus), Mrigavyadha (Sirius), Brahmahridaya (Capella). Magnitude-INDEPENDENT, so
    // faint-but-essential yogataras (Revati mag 5.2, Pushya 3.9, Ashlesha 3.4 ...) are labeled while
    // bright-but-irrelevant stars (Rigel, Achernar, Deneb ...) are not. No dedup: a shared name is
    // accurate -- Punarvasu IS the Pollux+Castor pair, so both carry it; likewise Vasishtha (Mizar)
    // & Arundhati (Alcor) are the famous close pair and both stay.
    for (let i = 0; i < n; i++) {
      const s = arr[i];
      const info = i18n.starLabelInfo(s[4], eclipticLatitude(s[1], s[2]));   // shared 3-view policy
      if (!info) continue;
      const lab = labelSprite(i18n.objectName(s[4]), STAR_LABEL_COL);
      lab.userData.src = s[4];
      lab.userData.di = i;             // star index, for deep-time repositioning
      // zodiac = on-ecliptic nakshatra star; the rashi band tints these gold, leaving off-zodiac
      // Hindu stars (Saptarishi, Dhruva, Abhijit/Vega ...) cool white.
      lab.userData.zodiac = info.zodiac;
      sizeLabel(lab, STAR_R * 0.017);
      scene.add(lab); starLabelSprites.push(lab);
    }
    applyStarTint();                     // gold if a zodiac star and the band is currently on
    setEpoch(starEpoch);                 // place at the current epoch
  }

  // On-ecliptic nakshatra labels turn gold while the Rashi band is shown (so the zodiacal stars read
  // as part of the band); everything else stays cool white. Re-bakes only labels whose color changes.
  const STAR_LABEL_COL = "#e2e9ff", ZODIAC_LABEL_COL = "#f0c060";
  function setLabelColor(sprite, color) {
    const lbl = sprite.userData.lbl;
    if (lbl.color === color) return;
    lbl.color = color;
    const tex = labelTexture(i18n.objectName(sprite.userData.src), color);
    if (sprite.material.map) sprite.material.map.dispose();
    sprite.material.map = tex; sprite.material.needsUpdate = true;
    lbl.aspect = tex.userData.aspect;
    if (lbl.h != null) sizeLabel(sprite, lbl.h);
  }
  function applyStarTint() {
    for (const lab of starLabelSprites) {
      setLabelColor(lab, (lab.userData.zodiac && rashiOn) ? ZODIAC_LABEL_COL : STAR_LABEL_COL);
    }
  }

  // Direction of star i at dt (years from J1991.25), as a length-R vector. P (optional) is the
  // ecliptic precession matrix for the epoch -- it carries the J2000 catalog direction to the
  // equinox of date so stars share the of-date frame of the bodies + Rashi band.
  function _starDirAt(i, dt, R, P) {
    const j = i * 3;
    let x = starP0[j] + starV3d[j] * dt;
    let y = starP0[j + 1] + starV3d[j + 1] * dt;
    let z = starP0[j + 2] + starV3d[j + 2] * dt;
    if (P) { const v = matVec(P, [x, y, z]); x = v[0]; y = v[1]; z = v[2]; }
    const inv = R / Math.hypot(x, y, z);
    return [x * inv, y * inv, z * inv];
  }

  // Drift + precess every star to `year` (CE). Cheap enough to call on demand (~5000 vec ops).
  function setEpoch(year) {
    starEpoch = year;
    if (!starPoints || !starP0) return;
    const dt = year - STAR_EPOCH0, n = starP0.length / 3;
    const P = eclipticPrecessionMatrix(jdOfYear(year));   // J2000 -> year, ecliptic frame
    for (let i = 0; i < n; i++) {
      const p = _starDirAt(i, dt, STAR_R, P), j = i * 3;
      starPosBuf[j] = p[0]; starPosBuf[j + 1] = p[1]; starPosBuf[j + 2] = p[2];
    }
    starPoints.geometry.attributes.position.needsUpdate = true;
    for (const lab of starLabelSprites) {
      const p = _starDirAt(lab.userData.di, dt, STAR_R * 0.97, P);
      lab.userData.base = p;             // frame() lifts this screen-up so the name clears the dot
      lab.position.set(p[0], p[1], p[2]);
    }
    if (starMarker && starMarker.userData.di >= 0) {   // search marker rides its star
      const p = _starDirAt(starMarker.userData.di, dt, 1150, P);
      starMarker.userData.base = p;
      starMarker.position.set(p[0], p[1], p[2]);
    }
    if (starRing && starRing.userData.di >= 0) {        // highlight ring rides the same star dot
      const p = _starDirAt(starRing.userData.di, dt, STAR_R, P);
      starRing.position.set(p[0], p[1], p[2]);
    }
  }

  // Deep-time mode: hide the planet DOTS/labels + rashi (no valid ephemeris far from the present),
  // but KEEP the orbit rings + trails as a solar-plane reference; the Sun + drifting stars remain.
  let deepTime = false;
  let regularYear = 2000;            // sim year of the last setData -> star epoch in the normal view
  function setDeepTime(on) {
    deepTime = on;
    for (const [id, mesh] of bodyMeshes) {
      if (id === "sun") continue;
      mesh.visible = !on;
      const l = bodyLabels.get(id); if (l) l.visible = !on;
    }
    if (on) { rashiBand.visible = false; rashiSight.visible = false; spicaAxis.visible = false; }
    else {
      rashiBand.visible = rashiOn; rashiSight.visible = rashiOn; spicaAxis.visible = rashiOn;
      setEpoch(regularYear);   // back to the live sim epoch (precessed), not a hard-coded 2000
    }
  }

  // Ecliptic reference: faint rings at 1/5/10/30 AU. (The 0 Aries reference is now the
  // Earth->Spica axis drawn with the Rashi band -- a Sun-rooted line was geocentrically
  // meaningless.) Rebuilt on scale change so the rings track the (log-)scaled positions.
  const ecliptic = new THREE.Group();
  scene.add(ecliptic);
  let lastAyan = 0;
  const scaleRadius = (au) => (scaleMode === "log" ? Math.log(1 + au) : au);
  function rebuildEcliptic() {
    ecliptic.clear();
    for (const au of [1, 5, 10, 30]) {
      const r = scaleRadius(au), seg = 128, pos = new Float32Array((seg + 1) * 3);
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * 2 * Math.PI;
        pos[3 * i] = Math.cos(a) * r; pos[3 * i + 1] = Math.sin(a) * r; pos[3 * i + 2] = 0;
      }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      ecliptic.add(new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: 0x223355, transparent: true, opacity: 0.5 })));
    }
  }
  function setAries(ayanamsaDeg) { lastAyan = ayanamsaDeg || 0; rebuildEcliptic(); if (rashiOn) rebuildRashiBand(); }
  rebuildEcliptic();

  // --- sidereal Rashi band (Vedic zodiac) ----------------------------------
  // Two independent facts, both honored here: the 12 sectors are FIXED TO THE STARS
  // (oriented by the ayanamsa -- sidereal 0 Aries, ~opposite Spica -- like the 3D-sky band),
  // while a planet's rashi is read GEOCENTRICALLY: the Earth->body sight-line (NOT the
  // Sun->body direction) picks the sector. The band sits at the star sphere so it frames the
  // real constellations; sight-line directions use TRUE positions, so the reading stays
  // correct in log scale (and passes through the body in linear scale).
  const RASHI = ["Mesha", "Vrishabha", "Mithuna", "Karka", "Simha", "Kanya",
    "Tula", "Vrischika", "Dhanu", "Makara", "Kumbha", "Meena"];
  const RASHI_R = 1180;
  const rashiBand = new THREE.Group(); rashiBand.visible = false; scene.add(rashiBand);
  const rashiSight = new THREE.Group(); rashiSight.visible = false; scene.add(rashiSight);
  const spicaAxis = new THREE.Group(); spicaAxis.visible = false; scene.add(spicaAxis);
  let rashiOn = false;

  function rebuildRashiBand() {
    rashiBand.clear();
    const off = lastAyan * D2R;                       // sidereal 0 Aries = tropical == ayanamsa
    // Center the dial on EARTH, not the origin: rashi is geocentric, so the sectors must radiate
    // from Earth. Origin-centering looks fine in linear scale (Earth ~1 AU from a 36 AU dial) but
    // throws the sectors off by ~10 deg in log scale (Earth ~0.7 vs a ~3.6 dial). The labelled
    // dial sits at a readable radius; the sight-lines (below) shoot on out to the stars.
    const e = lastData && lastData.bodies.find((b) => b.id === "earth");
    const c = e ? bodyRenderPos(e) : new THREE.Vector3(0, 0, 0);
    const R = scaleRadius(36);
    const seg = 180, ring = new Float32Array((seg + 1) * 3);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * 2 * Math.PI;
      ring[3 * i] = c.x + Math.cos(a) * R; ring[3 * i + 1] = c.y + Math.sin(a) * R; ring[3 * i + 2] = 0;
    }
    const rg = new THREE.BufferGeometry(); rg.setAttribute("position", new THREE.BufferAttribute(ring, 3));
    rashiBand.add(new THREE.LineLoop(rg, new THREE.LineBasicMaterial({ color: 0xe0a93a, transparent: true, opacity: 0.4 })));
    for (let k = 0; k < 12; k++) {
      const a = off + k * 30 * D2R;
      const tick = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(c.x + Math.cos(a) * R * 0.88, c.y + Math.sin(a) * R * 0.88, 0),
        new THREE.Vector3(c.x + Math.cos(a) * R * 1.06, c.y + Math.sin(a) * R * 1.06, 0)]);
      rashiBand.add(new THREE.Line(tick, new THREE.LineBasicMaterial({ color: 0xe0a93a, transparent: true, opacity: 0.7 })));
      const am = off + (k * 30 + 15) * D2R;
      const lab = labelSprite(i18n.tr(RASHI[k]), "#f0c060");   // sized below
      lab.position.set(c.x + Math.cos(am) * R * 1.12, c.y + Math.sin(am) * R * 1.12, 0);
      sizeLabel(lab, R * 0.0275);                      // ~match the readable "0 Aries" label
      rashiBand.add(lab);
    }
  }

  // Earth->body sight-lines (the geocentric vantage). Direction from TRUE heliocentric coords
  // -> picks the correct rashi in any scale; colored per body; the Sun line shows the solar
  // rashi (a boundary crossing = Sankranti) and the Moon line its monthly sweep.
  function rebuildRashiSight() {
    rashiSight.clear();
    if (!lastData) return;
    const e = lastData.bodies.find((b) => b.id === "earth");
    if (!e) return;
    const ep = bodyRenderPos(e);
    const dialR = scaleRadius(36);
    for (const b of lastData.bodies) {
      if (b.id === "earth") continue;
      // Rashi is ECLIPTIC LONGITUDE only, so the ray lies in the ecliptic plane (z=0): it then
      // sits IN the flat dial and crosses the exact sector, instead of a 3D line that dives off
      // the band by the body's latitude. Use the backend's APPARENT longitude when present (the
      // exact astrological value, matching the rashi label); else fall back to geometric XYZ.
      let ux, uy;
      if (b.geo_lon != null) {
        ux = Math.cos(b.geo_lon * D2R); uy = Math.sin(b.geo_lon * D2R);
      } else {
        const gx = b.x - e.x, gy = b.y - e.y, L = Math.hypot(gx, gy);
        if (L < 1e-12) continue;
        ux = gx / L; uy = gy / L;
      }
      const col = COLOR[b.id] || 0x8899aa;
      const a = new THREE.Vector3(ep.x, ep.y, 0);
      const far = new THREE.Vector3(ep.x + ux * RASHI_R, ep.y + uy * RASHI_R, 0);
      rashiSight.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, far]),
        new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.5 })));
      // Plumb line: drop from the body's true (off-ecliptic) position to its longitude ray, so
      // you can see where the body really is vs the longitude that fixes its rashi.
      const dot = bodyRenderPos(b);
      rashiSight.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([dot, new THREE.Vector3(dot.x, dot.y, 0)]),
        new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.3 })));
      // Label each line with its body + authoritative geocentric rashi (apparent longitude, the
      // same value the Kundali uses), e.g. "Chandra · Meena" -- so you can tell the lines apart.
      if (b.rashi_geocentric) {
        const txt = `${i18n.tr(GRAHA[b.id] || b.name)} · ${i18n.tr(b.rashi_geocentric)}`;
        const lab = labelSprite(txt, "#" + col.toString(16).padStart(6, "0"));
        lab.position.set(ep.x + ux * dialR * 1.28, ep.y + uy * dialR * 1.28, 0);
        sizeLabel(lab, dialR * 0.025);
        rashiSight.add(lab);
      }
    }
  }

  // The Lahiri reference AXIS through Earth: one ray to Spica (Chitra, sidereal ~180) and the
  // opposite ray to 0 Mesha. This single line IS the definition of the ayanamsa -- 0 Aries is
  // the direction opposite Spica. Drawn from Earth (geocentric, like the sight-lines) and aimed
  // at the actual Spica star, so it lands on the star you can search/see.
  function rebuildSpicaAxis() {
    spicaAxis.clear();
    if (!lastData) return;
    const e = lastData.bodies.find((b) => b.id === "earth");
    if (!e) return;
    const ep = bodyRenderPos(e);
    // Anchor this axis to the SAME sidereal zero as the Rashi band's ticks (off = of-date
    // ayanamsa) so the 0 Mesha ray coincides exactly with the Meena/Mesha divider. Spica defines
    // sidereal 180 (Chitra/Lahiri anchor). Deriving the ray from Spica's FIXED J2000 direction
    // instead left it ~0.4 deg off the of-date band -- the J2000->now precession the band already
    // folds into the ayanamsa.
    const off = lastAyan * D2R;
    const d = new THREE.Vector3(Math.cos(off + Math.PI), Math.sin(off + Math.PI), 0);
    const spicaEnd = new THREE.Vector3(ep.x + d.x * RASHI_R, ep.y + d.y * RASHI_R, 0);
    const ariesEnd = new THREE.Vector3(ep.x - d.x * RASHI_R, ep.y - d.y * RASHI_R, 0);
    const g = new THREE.BufferGeometry().setFromPoints([ariesEnd, spicaEnd]);
    spicaAxis.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xf5d878, transparent: true, opacity: 0.8 })));
    const dialR = scaleRadius(36);
    const sLab = labelSprite(i18n.tr("Spica · 180° Chitra"), "#f5d878");
    sLab.position.set(ep.x + d.x * dialR * 1.5, ep.y + d.y * dialR * 1.5, 0);
    sizeLabel(sLab, dialR * 0.025);
    spicaAxis.add(sLab);
    const aLab = labelSprite(i18n.tr("0° Mesha (opposite Spica)"), "#f5d878");
    aLab.position.set(ep.x - d.x * dialR * 1.5, ep.y - d.y * dialR * 1.5, 0);
    sizeLabel(aLab, dialR * 0.025);
    spicaAxis.add(aLab);
  }

  function setRashiBand(v) {
    rashiOn = v; rashiBand.visible = v; rashiSight.visible = v; spicaAxis.visible = v;
    if (v) { rebuildRashiBand(); rebuildRashiSight(); rebuildSpicaAxis(); }
    applyStarTint();                     // gold for on-ecliptic nakshatra labels while the band is on
  }

  // --- star highlight (search target) --------------------------------------
  // Stars are directions at infinity, not bodies you can orbit; "centre on Spica" means aim
  // the camera along that direction. Also drop a labelled marker so it's findable in the field.
  let starMarker = null, markerHidLabel = null, starRing = null;
  function hideStarMarker() {
    if (starMarker) { scene.remove(starMarker); starMarker = null; }
    if (starRing) { scene.remove(starRing); starRing = null; }
    if (markerHidLabel) { markerHidLabel.visible = true; markerHidLabel = null; }   // restore the persistent label
  }
  const STARMARK_R = 1150;
  function aimAtStar(raDeg, decDeg, name, idx) {
    // Aim at (and mark) the star's CURRENT position -- drifted in deep time, so a searched star
    // doesn't leave a static duplicate marker behind while the star itself drifts away.
    const dt = starEpoch - STAR_EPOCH0;
    const P = eclipticPrecessionMatrix(jdOfYear(starEpoch));
    let d;
    if (idx != null && idx >= 0 && starP0) {
      d = _starDirAt(idx, dt, 1, P);
    } else {
      const v = matVec(P, raDecToEcliptic(raDeg, decDeg)), L = Math.hypot(v[0], v[1], v[2]);
      d = [v[0] / L, v[1] / L, v[2] / L];
    }
    // Camera looks at `target` from target + radius*offset; for the view dir to equal d, the
    // offset unit must be -d. (Stars at infinity look the same from any solar-system point.)
    pol = Math.acos(Math.max(-1, Math.min(1, -d[2])));
    az = Math.atan2(-d[0], -d[1]);
    hideStarMarker();
    // Searched star: same name, same place (centered above the dot), just a distinct orange-red
    // highlight -- a glyph marker read like just another star in the field.
    starMarker = labelSprite(i18n.objectName(name), "#ff6a3d");
    starMarker.userData.src = name;
    starMarker.userData.di = (idx != null && idx >= 0) ? idx : -1;   // drift the marker with the star
    starMarker.userData.base = [d[0] * STARMARK_R, d[1] * STARMARK_R, d[2] * STARMARK_R];
    starMarker.position.set(d[0] * STARMARK_R, d[1] * STARMARK_R, d[2] * STARMARK_R);
    sizeLabel(starMarker, STARMARK_R * 0.017);   // match the persistent star labels' size
    starMarker.renderOrder = 2;                   // name draws ON TOP of the ring (both depthTest:false)
    scene.add(starMarker);
    // Cyan ring ON the star dot (at STAR_R, no screen-up offset) so the highlighted object itself is
    // marked, not just labeled. Rides its star in setEpoch just like the marker. renderOrder below the
    // name so the ring sits BEHIND it -- the orange-red name stays readable where they overlap.
    starRing = ringSprite();
    starRing.userData.di = starMarker.userData.di;
    starRing.position.set(d[0] * STAR_R, d[1] * STAR_R, d[2] * STAR_R);
    starRing.scale.set(STAR_R * 0.05, STAR_R * 0.05, 1);
    starRing.renderOrder = 1;
    scene.add(starRing);
    // If this star already carries a persistent label (mag < 2.2), hide it so the gold marker
    // replaces it in place (otherwise the two stack and render as garbled "double" text).
    // hideStarMarker() restores it on deselect.
    if (starMarker.userData.di >= 0) {
      markerHidLabel = starLabelSprites.find((l) => l.userData.di === starMarker.userData.di) || null;
      if (markerHidLabel) markerHidLabel.visible = false;
    }
  }

  // Re-bake every text label for the current language (called on a language change). Body and
  // star labels carry their English source in userData.src; rashi/Spica labels rebuild wholesale.
  function relabelObjects() {
    if (lastData) {
      for (const b of lastData.bodies) {
        const lab = bodyLabels.get(b.id);
        if (lab) setLabelText(lab, i18n.objectName(b.name));
      }
    }
    for (const lab of starLabelSprites) setLabelText(lab, i18n.objectName(lab.userData.src));
    if (starMarker && starMarker.userData.src) setLabelText(starMarker, i18n.objectName(starMarker.userData.src));
    if (rashiOn) { rebuildRashiBand(); rebuildRashiSight(); rebuildSpicaAxis(); }
  }

  // Milky Way backdrop (galactic plane oriented into the ecliptic frame) -- cosmic context.
  new THREE.TextureLoader().load("/textures/milkyway.jpg", (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1150, 48, 24),
      new THREE.MeshBasicMaterial({
        map: tex, side: THREE.BackSide, transparent: true, opacity: 0.22,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    const gc = new THREE.Vector3(...raDecToEcliptic(266.405, -28.936));
    const ngp = new THREE.Vector3(...raDecToEcliptic(192.859, 27.128));
    const l90 = new THREE.Vector3().crossVectors(ngp, gc).normalize();
    mesh.matrixAutoUpdate = false;
    mesh.matrix.makeBasis(gc, ngp, l90);
    scene.add(mesh);
  });


  // --- frame ---------------------------------------------------------------
  function frame() {
    // Screen-up direction, so name labels sit just ABOVE their dot (not on top of it) at any
    // orbit angle -- shared by the planet labels and the star labels below.
    const camUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    if (lastData) {
      // Keep the orbit pivot locked onto the followed body as it moves.
      if (followId) {
        const fb = lastData.bodies.find((b) => b.id === followId);
        if (fb) target.copy(bodyRenderPos(fb));
      }
      for (const b of lastData.bodies) {
        const mesh = bodyMeshes.get(b.id); if (!mesh) continue;
        const p = bodyRenderPos(b);
        mesh.position.copy(p);
        const dist = camera.position.distanceTo(p);
        const ms = Math.max(0.002, dist * (SIZE[b.id] || 0.003));   // rendered sphere radius
        mesh.scale.setScalar(ms);
        const lab = bodyLabels.get(b.id);
        if (lab) {
          // Sit just above the dot's EDGE: the offset includes the dot radius (ms), so the gap
          // stays tight at every zoom. A fixed centre-offset drifts away as the dot shrinks.
          // Label sized to the 3D view's on-screen fraction (~1.6% height), distance-scaled.
          lab.position.copy(p).addScaledVector(camUp, ms + dist * 0.013);
          sizeLabel(lab, dist * 0.017);
        }
      }
      // Moon trail rides the moving Earth.
      const e = lastData.bodies.find((b) => b.id === "earth");
      if (e) {
        const ep = bodyRenderPos(e);
        for (const line of trailGroup.children) {
          if (line.userData.relativeTo === "earth") line.position.copy(ep);
        }
      }
    }
    // Lift each star NAME just above its dot (screen-up), like the planet labels -- consistent
    // placement across planets and stars. Stars aren't repositioned per frame otherwise, so the
    // offset is applied here to track the camera as it orbits. base cached by setEpoch/aimAtStar.
    for (const lab of starLabelSprites) {
      const b = lab.userData.base; if (!b || !lab.visible) continue;
      lab.position.set(b[0], b[1], b[2]).addScaledVector(camUp, lab.userData.lbl.h * 0.6);
    }
    if (starMarker && starMarker.userData.base) {
      const b = starMarker.userData.base;
      starMarker.position.set(b[0], b[1], b[2]).addScaledVector(camUp, starMarker.userData.lbl.h * 0.6);
    }
    applyKeyOrbit();
    applyCamera();
    renderer.render(scene, camera);
  }

  // Smooth arrow-key orbit: held keys rotate at a steady angular rate (framerate-independent),
  // which is far more predictable than mouse drag. Left/Right swing around; Up/Down tilt the
  // view between top-down and edge-on. Matches the drag directions.
  function applyKeyOrbit() {
    if (!heldKeys.size) { keyLast = 0; return; }
    const now = performance.now();
    const dt = keyLast ? Math.min(0.05, (now - keyLast) / 1000) : 1 / 60;
    keyLast = now;
    const w = 1.2;                              // rad/s
    if (heldKeys.has("ArrowLeft")) az += w * dt;
    if (heldKeys.has("ArrowRight")) az -= w * dt;
    if (heldKeys.has("ArrowUp")) pol -= w * dt;   // rise toward a top-down view
    if (heldKeys.has("ArrowDown")) pol += w * dt; // drop toward edge-on
  }

  // --- input ---------------------------------------------------------------
  let dragging = false, lastX = 0, lastY = 0;
  const el = renderer.domElement;
  el.addEventListener("pointerdown", (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; el.setPointerCapture(e.pointerId); });
  el.addEventListener("pointerup", (e) => { dragging = false; el.releasePointerCapture(e.pointerId); });
  el.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    az -= (e.clientX - lastX) * 0.005;
    pol += (e.clientY - lastY) * 0.005;   // drag up -> rise to top-down (was inverted)
    lastX = e.clientX; lastY = e.clientY;
  });
  el.addEventListener("wheel", (e) => { e.preventDefault(); radius *= e.deltaY < 0 ? 0.9 : 1.1; }, { passive: false });
  // Arrow-key orbit (the intuitive control). Active only while the orrery view is showing;
  // keyup always releases so a key can't get stuck when switching views mid-press.
  const ARROWS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);
  window.addEventListener("keydown", (e) => {
    if (!ARROWS.has(e.key) || container.hidden) return;
    e.preventDefault(); heldKeys.add(e.key);
  });
  window.addEventListener("keyup", (e) => { if (ARROWS.has(e.key)) heldKeys.delete(e.key); });
  window.addEventListener("blur", () => heldKeys.clear());
  // Double-click a body to follow it (retarget the orbit pivot).
  el.addEventListener("dblclick", (e) => {
    const rect = el.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    let bestId = null, bestD = 0.4;
    for (const [id, mesh] of bodyMeshes) {
      const sp = mesh.position.clone().project(camera);
      const d = Math.hypot(sp.x - ndc.x, sp.y - ndc.y);
      if (d < bestD) { bestD = d; bestId = id; }
    }
    followId = bestId;                       // follow a body, or null (Sun) on empty space
    if (!bestId) target.set(0, 0, 0);
  });
  window.addEventListener("resize", resize);
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
  }

  // --- picking (Phase 8) ---------------------------------------------------
  let selectedDesc = null;
  function _descriptor(b) {
    const type = b.id === "sun" ? "The Sun" : b.id === "earth" ? "Earth (your vantage point)"
      : b.dwarf ? "Dwarf planet" : b.id === "moon" ? "The Moon" : "Planet";
    return { kind: "orrery", _id: b.id, name: b.name, type,
      helioAu: b.id === "sun" ? null : b.helio_au, rashi: b.rashi_geocentric, periodDays: PERIOD_DAYS[b.id] };
  }
  function pickAt(clientX, clientY) {
    if (!lastData) return null;
    const rect = el.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    let bestId = null, bestD = 0.06;
    for (const [id, mesh] of bodyMeshes) {
      const sp = mesh.position.clone().project(camera);
      const d = Math.hypot(sp.x - ndc.x, sp.y - ndc.y);
      if (d < bestD) { bestD = d; bestId = id; }
    }
    const b = bestId && lastData.bodies.find((x) => x.id === bestId);
    return b ? _descriptor(b) : null;
  }
  function findByName(name) {
    const lc = name.toLowerCase();
    const b = lastData && lastData.bodies.find((x) => x.name.toLowerCase() === lc);
    if (b) return _descriptor(b);
    if (starsRawO) {                 // background stars are searchable here too
      const idx = starsRawO.findIndex((x) => x[4] && x[4].toLowerCase() === lc);
      if (idx >= 0) {
        const s = starsRawO[idx];
        return { kind: "star", name: s[4], type: "Star", mag: s[3], raDeg: s[1], decDeg: s[2], _starIdx: idx };
      }
    }
    return null;
  }

  return {
    setData, setTrails, setStars, setAries, setRashiBand, relabelObjects, setEpoch, setDeepTime,
    frame, resize, pickAt, findByName,
    snapshot: () => { renderer.render(scene, camera); return renderer.domElement.toDataURL("image/png"); },
    setSelected: (d) => { selectedDesc = d; },
    clearSelection: () => { selectedDesc = null; hideStarMarker(); },   // drop the search highlight, restore the star's label
    lookAtSelected: () => {
      if (!selectedDesc) return;
      if (selectedDesc._id) { followId = selectedDesc._id; hideStarMarker(); }   // a solar-system body
      else if (selectedDesc.kind === "star" && selectedDesc.raDeg != null) {
        aimAtStar(selectedDesc.raDeg, selectedDesc.decDeg, selectedDesc.name, selectedDesc._starIdx);
      }
    },
    // Rebuild trails + rings on scale change; bodies re-scale automatically each frame.
    setScaleMode: (m) => { scaleMode = m; rebuildEcliptic(); if (rashiOn) { rebuildRashiBand(); rebuildRashiSight(); rebuildSpicaAxis(); } if (lastTrails) setTrails(lastTrails); },
    resetView: () => { followId = null; target.set(0, 0, 0); radius = 40; az = 0; pol = 0.9; hideStarMarker(); },
    setVisible: (v) => { renderer.domElement.style.display = v ? "block" : "none"; },
    // Orbit camera: tilt from top-down (0=looking straight down, 90=edge-on), spin around, and zoom
    // (relative to the default framing). Reference: top-down, default distance.
    getOrientation() {
      const tilt = pol * 180 / Math.PI;
      const spin = ((az * 180 / Math.PI) % 360 + 360) % 360;
      return `Tilt ${tilt.toFixed(1)}° · Spin ${spin.toFixed(1)}° · Zoom ${(40 / radius).toFixed(2)}×`;
    },
    toggleStars: (v) => { starsOn = v; if (starPoints) starPoints.visible = v; for (const lab of starLabelSprites) lab.visible = v; },
    renderer, scene, camera,
  };
}
