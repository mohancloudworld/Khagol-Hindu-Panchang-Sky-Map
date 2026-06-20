// view3d.js -- 3D celestial sphere (Phase 6). Three.js, vendored (no CDN).
//
// Camera sits at the origin inside a radius-100 sphere and looks around. Stars live in an
// equatorial Group whose matrix is set each frame from astro.starGroupMatrix(lst, lat, jd)
// (precession folded in) -- zero per-star CPU. Sun/Moon/planets are sprites placed from the
// backend alt/az. Atmosphere ON (default) is implemented here; the OFF mode is Phase 7C.

import * as THREE from "../vendor/three.module.js";
import * as astro from "./astro.js";
import * as overlays from "./overlays.js";
import * as i18n from "./i18n.js";

const RADIUS = 100;        // star sphere radius
const BODY_R = 99;         // sun/moon/planet sprite distance
const FOV_REF = 70;        // reference FOV (used to scale the star-pick radius with zoom)
// Name labels are sized to a FIXED on-screen pixel height each frame (like the 2D view's 11px font),
// so 3D names look the same size/crispness as 2D regardless of FOV or window size. The texture draws
// the text em at 0.625 of the sprite height, so an 18px sprite -> ~11px text == the 2D label.
const LABEL_PX = 18;
const D2R = Math.PI / 180;
const MAS2RAD = Math.PI / (180 * 3600 * 1000);   // milliarcsec -> radian
const KMS2PCYR = 1.0227121e-6;                   // km/s -> parsec/year

const PLANET_COLOR = {
  mercury: "#b0a08f", venus: "#e8d8a0", mars: "#d06a40", jupiter: "#d8b890",
  saturn: "#d8c890", uranus: "#a0d0d0", neptune: "#6080d0",
};

// --- procedural sprite textures (no image downloads) -----------------------

function discTexture(inner, outer, size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const r = size / 2 - 2;
  // Solid disc with a soft off-centre highlight for a little 3D shading, but a HARD rim so it
  // reads as a crisp circle like the 2D view -- not a glow fading to transparent.
  const grad = g.createRadialGradient(size * 0.38, size * 0.38, r * 0.1, size / 2, size / 2, r);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.beginPath(); g.arc(size / 2, size / 2, r, 0, 2 * Math.PI); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Moon disc with a phase terminator from illuminated fraction (orientation simplified --
// pitfall #12). k in [0,1]; waxing>0 lights the right limb.
function moonTexture(k, waxing, size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const r = size / 2 - 3, cx = size / 2, cy = size / 2;
  g.fillStyle = "#0a0a12";                       // unlit disc
  g.beginPath(); g.arc(cx, cy, r, 0, 2 * Math.PI); g.fill();
  g.fillStyle = "#e8e8d8";                        // lit region
  g.beginPath();
  const x = r * (1 - 2 * k);                       // terminator semi-minor (signed)
  if (waxing) {
    g.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, false);
    g.ellipse(cx, cy, Math.abs(x), r, 0, Math.PI / 2, -Math.PI / 2, k < 0.5);
  } else {
    g.arc(cx, cy, r, Math.PI / 2, -Math.PI / 2, false);
    g.ellipse(cx, cy, Math.abs(x), r, 0, -Math.PI / 2, Math.PI / 2, k < 0.5);
  }
  g.fill();
  // Rim outline so the (mostly unlit) disc is still visible against the black sky -- the 2D moon
  // does the same; without it a crescent/new Moon vanishes.
  g.strokeStyle = "#8a8a96"; g.lineWidth = Math.max(1, size * 0.012);
  g.beginPath(); g.arc(cx, cy, r, 0, 2 * Math.PI); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Saturn with rings (procedural; no image downloads).
function saturnTexture(size = 512) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const cx = size / 2, cy = size / 2, R = size * 0.16;
  g.save(); g.translate(cx, cy); g.rotate(-0.42);
  // back half of the ring
  g.strokeStyle = "#cdbb8a"; g.lineWidth = size * 0.045;
  g.beginPath(); g.ellipse(0, 0, R * 2.3, R * 0.8, 0, Math.PI, 2 * Math.PI); g.stroke();
  g.restore();
  // planet disc
  const grad = g.createRadialGradient(cx - R * 0.3, cy - R * 0.3, 0, cx, cy, R);
  grad.addColorStop(0, "#efe2b8"); grad.addColorStop(1, "#c8b074");
  g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.fill();
  g.save(); g.translate(cx, cy); g.rotate(-0.42);
  // front half of the ring
  g.strokeStyle = "#e6d6a4"; g.lineWidth = size * 0.045;
  g.beginPath(); g.ellipse(0, 0, R * 2.3, R * 0.8, 0, 0, Math.PI); g.stroke();
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Render unit vector (x East, y Up, z South) -> alt/az degrees.
function vecToAltAz(x, y, z) {
  const r = Math.hypot(x, y, z) || 1;
  return [Math.asin(Math.max(-1, Math.min(1, y / r))) * 180 / Math.PI,
    (Math.atan2(x, -z) * 180 / Math.PI + 360) % 360];
}

function crosshairTexture(size = 64) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  g.strokeStyle = "#33ddff"; g.lineWidth = 2.5;
  g.beginPath(); g.arc(size / 2, size / 2, size * 0.32, 0, 2 * Math.PI); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function diamondTexture(size = 32) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  g.translate(size / 2, size / 2); g.rotate(Math.PI / 4);
  g.strokeStyle = "#9ad0c0"; g.lineWidth = 2.5;
  const s = size * 0.3;
  g.strokeRect(-s, -s, 2 * s, 2 * s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function labelTexture(text, color = "#cfd8ff") {
  const s = 3;                          // supersample so the text stays crisp like the 2D canvas font
  const c = document.createElement("canvas");
  c.width = 128 * s; c.height = 32 * s;
  const g = c.getContext("2d");
  g.font = `${20 * s}px system-ui, sans-serif`;
  g.fillStyle = color;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, c.width / 2, c.height / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Like labelTexture but the canvas WIDTH fits the text, so long names ("Brahmahridaya",
// "Mrigavyadha") are not clipped at the ends. Carries the aspect so the sprite is sized by height
// with the matching width (no horizontal squash). Used for the variable-length star/search labels.
const _measCtx3d = document.createElement("canvas").getContext("2d");
function fittedLabelTexture(text, color = "#cfd8ff") {
  const s = 3, fontPx = 20 * s, padX = 9 * s, h = 32 * s;
  const font = `600 ${fontPx}px system-ui, sans-serif`;   // semibold reads clearer on the star field
  _measCtx3d.font = font;
  const w = Math.max(16, Math.ceil(_measCtx3d.measureText(text || " ").width) + padX * 2);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  g.font = font; g.fillStyle = color; g.textAlign = "center"; g.textBaseline = "middle";
  // Dark halo so the name stays legible over the bright Milky Way / dense stars, then a crisp second
  // pass over the glow (matches the orrery labels). Without it light text washes out on the starfield.
  g.shadowColor = "rgba(0,0,0,0.9)"; g.shadowBlur = 4 * s;
  g.fillText(text, w / 2, h / 2);
  g.shadowBlur = 0; g.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.userData = { aspect: w / h };
  return t;
}

// --- star shader -----------------------------------------------------------

function starMaterial(pixelRatio) {
  return new THREE.ShaderMaterial({
    uniforms: { pixelRatio: { value: pixelRatio }, dayFactor: { value: 1.0 } },
    transparent: true,
    depthTest: true,
    depthWrite: false,
    vertexShader: `
      attribute float magnitude;
      uniform float pixelRatio;
      uniform float dayFactor;
      varying float vBright;
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(6.0 * pow(10.0, -0.18 * magnitude), 1.0, 12.0) * pixelRatio;
        vBright = clamp(1.3 - 0.18 * magnitude, 0.05, 1.0) * dayFactor;
      }`,
    fragmentShader: `
      varying float vBright;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vec3(vBright), a);
      }`,
  });
}

// --- view factory ----------------------------------------------------------

export function createView3D(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070f);
  const camera = new THREE.PerspectiveCamera(70, container.clientWidth / container.clientHeight, 0.1, 1000);

  // Look-around-from-center controls (NOT OrbitControls).
  let yaw = Math.PI, pitch = 0.35;             // azimuth (rad, 0=N), altitude (rad)
  let tYaw = yaw, tPitch = pitch, fov = 70;
  // Smooth arrow-key look-around (like the orrery): ←→ pan azimuth, ↑↓ tilt altitude. Held keys
  // move at a steady angular rate, scaled by zoom so it feels consistent at any FOV.
  const heldKeys = new Set();
  let keyLast = 0;
  function applyKeyOrbit() {
    if (!heldKeys.size) { keyLast = 0; return; }
    const now = performance.now();
    const dt = keyLast ? Math.min(0.05, (now - keyLast) / 1000) : 1 / 60;
    keyLast = now;
    const w = 1.1 * (fov / 70);
    if (heldKeys.has("ArrowLeft")) tYaw -= w * dt;
    if (heldKeys.has("ArrowRight")) tYaw += w * dt;
    if (heldKeys.has("ArrowUp")) tPitch += w * dt;
    if (heldKeys.has("ArrowDown")) tPitch -= w * dt;
    tPitch = Math.max(-89.9 * Math.PI / 180, Math.min(89.9 * Math.PI / 180, tPitch));
  }
  function applyCamera() {
    yaw += (tYaw - yaw) * 0.2;
    pitch += (tPitch - pitch) * 0.2;
    const dir = new THREE.Vector3(
      Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), -Math.cos(pitch) * Math.cos(yaw));
    camera.lookAt(dir);
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  // Star group (equatorial coords; matrix set manually each frame).
  const starGeom = new THREE.BufferGeometry();
  const starMat = starMaterial(pixelRatio);
  const starPoints = new THREE.Points(starGeom, starMat);
  starPoints.frustumCulled = false;
  const starGroup = new THREE.Group();
  starGroup.matrixAutoUpdate = false;
  starGroup.add(starPoints);
  scene.add(starGroup);
  const _m4 = new THREE.Matrix4();

  // Constellation/Messier group shares the star group's J2000->date rotation (Phase 7B).
  const overlayGroup = new THREE.Group();
  overlayGroup.matrixAutoUpdate = false;
  scene.add(overlayGroup);
  // Ecliptic + Rashi band are of-date -> rotated by horizontalMatrix only (no precession).
  const eclipticGroup = new THREE.Group();
  eclipticGroup.matrixAutoUpdate = false;
  scene.add(eclipticGroup);
  const _h4 = new THREE.Matrix4();
  const _camFwd = new THREE.Vector3();   // reused each frame for label depth compensation
  let constLines = null, eclLine = null, rashiTicks = null;
  const rashiLabels = [];
  const constLabelSprites = [];
  const diamondTex = diamondTexture();
  const messierSprites = [], messierLabels = [];
  let messierOn = false;
  let starsRaw = null;
  // Deep-time star drift (uniform precession + proper motion). Off by default; gated so normal
  // mode is the exact original path.
  let starP0 = null, starV3d = null, starBaseBuf = null, deepOn = false, deepEpoch = 2000, lastCons = null;
  // Persistent labels for the Hindu-astrology stars (shared 3-view policy). On-ecliptic nakshatra
  // stars (userData.zodiac) turn gold while the rashi band is on.
  const starLabelSprites3d = [];
  let rashiOn = false;
  let starsOn = true;                   // catalog star field + labels (Stars toggle)
  const STAR_LABEL_COL = "#e2e9ff", ZODIAC_LABEL_COL = "#f0c060";

  // Picking + selection crosshair (Phase 8).
  const raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = 1.5;
  const crosshair = new THREE.Sprite(new THREE.SpriteMaterial({ map: crosshairTexture(), depthTest: false, transparent: true }));
  crosshair.visible = false;
  scene.add(crosshair);
  // Orange-red name for a searched STAR/DSO (bodies already carry their own name sprite). Hidden
  // until a labelless object is selected; positioned above the crosshair each frame.
  const selLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: fittedLabelTexture("", "#ff6a3d"), depthTest: false, transparent: true }));
  selLabel.userData.aspect = 4;
  selLabel.visible = false;
  scene.add(selLabel);
  let markerHidLabel3d = null;          // persistent star label hidden while its orange marker shows
  let selected = null;
  let lastLst = null, lastLat = 0, lastJd = 0, lastSimMs = 0;

  // Extrapolate a body's of-date ra/dec from the last fetch by its angular rate (Phase: true
  // per-frame model) -> smooth orbital drift every frame; the matrix adds the diurnal spin.
  function bodyVec(b) {
    const dtHr = (lastSky && lastSky._fetchMs != null) ? (lastSimMs - lastSky._fetchMs) / 3600000 : 0;
    const ra = b.ra_hours * 15 + (b.ra_rate_dph || 0) * dtHr;
    const dec = b.dec_deg + (b.dec_rate_dph || 0) * dtHr;
    return astro.raDecToVec(ra, dec);
  }

  // Milky Way: textured inside-out sphere oriented galactic -> equatorial J2000, placed in
  // the precessed star group so it tracks the stars. Loaded async; absent texture -> no-op.
  let milkyway = null;
  new THREE.TextureLoader().load("/textures/milkyway.jpg", (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(96, 64, 32),
      new THREE.MeshBasicMaterial({
        map: tex, side: THREE.BackSide, transparent: true, opacity: 0.45,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    const ngp = new THREE.Vector3(...astro.raDecToVec(192.859, 27.128));   // N galactic pole
    const gc = new THREE.Vector3(...astro.raDecToVec(266.405, -28.936));   // galactic centre
    const l90 = new THREE.Vector3().crossVectors(ngp, gc).normalize();
    mesh.matrixAutoUpdate = false;
    mesh.matrix.makeBasis(gc, ngp, l90);    // galactic basis expressed in equatorial J2000
    mesh.visible = false;
    overlayGroup.add(mesh);
    milkyway = mesh;
  });

  // Body sprites.
  const bodyGroup = new THREE.Group();
  scene.add(bodyGroup);
  const sunTex = discTexture("#fffbe8", "#ffd24a");
  const saturnTex = saturnTexture();
  const bodySprites = new Map();   // id -> THREE.Sprite
  const bodyLabels = new Map();    // id -> THREE.Sprite (name label)

  // Ground: opaque lower HEMISPHERE shell (radius 99, inside the star sphere). A flat disc at
  // eye level gets sliced by the camera near-plane at steep down-angles and leaks below-horizon
  // objects; a hemisphere is solid in every downward direction. BackSide = seen from the centre.
  // Opaque in ground mode (real occlusion); translucent + non-occluding in space mode (7C).
  const ground = new THREE.Mesh(
    new THREE.SphereGeometry(94, 48, 24, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x0a0f14, transparent: false, opacity: 1.0, side: THREE.BackSide }),
  );
  scene.add(ground);

  // Cardinal labels on the horizon.
  for (const [text, az] of [["N", 0], ["E", 90], ["S", 180], ["W", 270]]) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(text, "#8fa0c0"), depthTest: false }));
    const v = astro.horizontalToVec(0, az);
    s.position.set(v[0] * BODY_R, v[1] * BODY_R + 2, v[2] * BODY_R);
    s.scale.set(8, 2, 1);
    scene.add(s);
  }

  // Alt/az grid (toggleable).
  const grid = buildGrid();
  grid.visible = false;
  scene.add(grid);

  function buildGrid() {
    const pts = [];
    for (let az = 0; az < 360; az += 30) {
      for (let alt = 0; alt < 90; alt += 3) {
        const a = astro.horizontalToVec(alt, az), b = astro.horizontalToVec(alt + 3, az);
        pts.push(a[0] * RADIUS, a[1] * RADIUS, a[2] * RADIUS, b[0] * RADIUS, b[1] * RADIUS, b[2] * RADIUS);
      }
    }
    for (let alt = 0; alt <= 60; alt += 30) {
      for (let az = 0; az < 360; az += 3) {
        const a = astro.horizontalToVec(alt, az), b = astro.horizontalToVec(alt, az + 3);
        pts.push(a[0] * RADIUS, a[1] * RADIUS, a[2] * RADIUS, b[0] * RADIUS, b[1] * RADIUS, b[2] * RADIUS);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x224466, transparent: true, opacity: 0.4 }));
  }

  function setRashiVisible(v) {
    rashiOn = v;
    if (eclLine) { eclLine.visible = v; rashiTicks.visible = v; rashiLabels.forEach((l) => { l.visible = v; }); }
    applyStarTint3d();                   // gold for on-ecliptic nakshatra labels while the band is on
  }

  function _lineSegments(flatUnit, color, opacity, loop = false) {
    const pos = new Float32Array(flatUnit.length);
    for (let i = 0; i < flatUnit.length; i++) pos[i] = flatUnit[i] * RADIUS;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    const obj = loop ? new THREE.LineLoop(geom, mat) : new THREE.LineSegments(geom, mat);
    obj.frustumCulled = false; obj.visible = false;
    return obj;
  }

  // Build constellation lines (J2000) + ecliptic/Rashi band (of-date) + Messier. Phase 7B.
  // (Re)build the constellation line layer from a HIP->vector map (drifted in deep time).
  function _setConstLines(starMap) {
    if (constLines) { overlayGroup.remove(constLines); constLines = null; }
    if (!lastCons) return;
    constLines = _lineSegments(overlays.constellationVerts(lastCons, starMap), 0x4870b0, 0.35);
    overlayGroup.add(constLines);
  }

  function setOverlayData({ cons, starMap, ayanamsaDeg, jd, messier: od_messier }) {
    lastCons = cons;
    _setConstLines(deepOn ? _driftedStarMap(deepEpoch - 1991.25) : starMap);

    // Constellation name labels at each figure's centroid.
    for (const o of constLabelSprites) overlayGroup.remove(o);
    constLabelSprites.length = 0;
    for (const lab of overlays.constellationLabels(cons, starMap)) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: labelTexture(lab.name, "#6f8fc8"), depthTest: true, transparent: true, opacity: 0.85,
      }));
      s.position.set(lab.vec[0] * RADIUS * 0.99, lab.vec[1] * RADIUS * 0.99, lab.vec[2] * RADIUS * 0.99);
      s.scale.set(11, 2.75, 1); s.visible = false;
      overlayGroup.add(s); constLabelSprites.push(s);
    }

    for (const o of [eclLine, rashiTicks, ...rashiLabels]) if (o) eclipticGroup.remove(o);
    rashiLabels.length = 0;
    const g = overlays.eclipticGeometry(ayanamsaDeg, jd);
    eclLine = _lineSegments(g.line, 0xe0a93a, 0.5, true);
    rashiTicks = _lineSegments(g.ticks, 0xe0a93a, 0.75);
    eclipticGroup.add(eclLine); eclipticGroup.add(rashiTicks);
    for (const lab of g.labels) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: labelTexture(lab.name, "#e0a93a"), depthTest: true, transparent: true,
      }));
      s.position.set(lab.vec[0] * RADIUS * 0.99, lab.vec[1] * RADIUS * 0.99, lab.vec[2] * RADIUS * 0.99);
      s.scale.set(9, 2.25, 1); s.visible = false;
      eclipticGroup.add(s); rashiLabels.push(s);
    }

    // Messier objects (J2000 -> star group): faint diamond markers + labels at high zoom.
    for (const o of [...messierSprites, ...messierLabels]) overlayGroup.remove(o);
    messierSprites.length = 0; messierLabels.length = 0;
    for (const obj of (od_messier || [])) {
      const p = [obj.vec[0] * RADIUS, obj.vec[1] * RADIUS, obj.vec[2] * RADIUS];
      const mk = new THREE.Sprite(new THREE.SpriteMaterial({ map: diamondTex, depthTest: true, transparent: true, opacity: 0.85 }));
      mk.position.set(...p); mk.scale.set(2.4, 2.4, 1); mk.visible = false;
      mk.userData.messier = obj;
      overlayGroup.add(mk); messierSprites.push(mk);
      const lab = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture("M" + obj.id, "#9ad0c0"), depthTest: true, transparent: true }));
      lab.position.set(p[0], p[1] - 2.6, p[2]); lab.scale.set(6, 1.5, 1); lab.visible = false;
      overlayGroup.add(lab); messierLabels.push(lab);
    }
  }

  // Rewrite an existing LineSegments/LineLoop's vertices in place (unit verts -> sphere).
  function rebuildLinePositions(obj, flatUnit) {
    const pos = new Float32Array(flatUnit.length);
    for (let i = 0; i < flatUnit.length; i++) pos[i] = flatUnit[i] * RADIUS;
    obj.geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  }

  // Refresh ONLY the of-date ecliptic/Rashi layer after a sim-time change (same geometry math
  // as setOverlayData). Reuses the existing line objects + label sprites, so the band's
  // visibility and the labels' textures are preserved -- no GPU/texture churn during time-lapse.
  function setEcliptic(ayanamsaDeg, jd) {
    if (!eclLine) return;     // overlay not built yet
    const g = overlays.eclipticGeometry(ayanamsaDeg, jd);
    rebuildLinePositions(eclLine, g.line);
    rebuildLinePositions(rashiTicks, g.ticks);
    for (let i = 0; i < rashiLabels.length && i < g.labels.length; i++) {
      const v = g.labels[i].vec;
      rashiLabels[i].position.set(v[0] * RADIUS * 0.99, v[1] * RADIUS * 0.99, v[2] * RADIUS * 0.99);
    }
  }

  // --- public methods ------------------------------------------------------

  function setStars(starsData) {
    starsRaw = starsData.stars;
    const arr = starsData.stars;
    const pos = new Float32Array(arr.length * 3);
    const mag = new Float32Array(arr.length);
    // Per-star 3D space motion (equatorial frame) for the deep-time view: position p0 (pc) +
    // velocity v3d (pc/yr) from proper motion + parallax + radial velocity (same model as the
    // orrery, but equatorial since the star group works on J2000 equatorial vectors).
    starP0 = new Float64Array(arr.length * 3);
    starV3d = new Float64Array(arr.length * 3);
    for (let i = 0; i < arr.length; i++) {
      const s = arr[i], ra = s[1] * D2R, dec = s[2] * D2R;
      const v = astro.raDecToVec(s[1], s[2]);
      pos[3 * i] = v[0] * RADIUS; pos[3 * i + 1] = v[1] * RADIUS; pos[3 * i + 2] = v[2] * RADIUS;
      mag[i] = s[3];
      const eRA = [-Math.sin(ra), Math.cos(ra), 0];
      const eDec = [-Math.sin(dec) * Math.cos(ra), -Math.sin(dec) * Math.sin(ra), Math.cos(dec)];
      const plx = s[7] || 0, dist = plx > 0 ? 1000 / plx : 1.0;
      const muA = (s[5] || 0) * MAS2RAD, muD = (s[6] || 0) * MAS2RAD;
      const vr = plx > 0 ? (s[8] || 0) * KMS2PCYR : 0;
      for (let k = 0; k < 3; k++) {
        starP0[i * 3 + k] = v[k] * dist;
        starV3d[i * 3 + k] = (muA * eRA[k] + muD * eDec[k]) * dist + vr * v[k];
      }
    }
    starBaseBuf = pos;                  // J2000 buffer, restored when leaving deep time
    starGeom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    starGeom.setAttribute("magnitude", new THREE.BufferAttribute(mag, 1));
    // Default star labels: Hindu-astrology stars (shared policy). Positioned per-frame in frame().
    for (const o of starLabelSprites3d) scene.remove(o);
    starLabelSprites3d.length = 0;
    for (let i = 0; i < arr.length; i++) {
      const info = i18n.starLabelInfo(arr[i][4], astro.eclipticLatitude(arr[i][1], arr[i][2]));
      if (!info) continue;
      const tex = fittedLabelTexture(i18n.objectName(arr[i][4]), STAR_LABEL_COL);
      const lab = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true }));
      lab.userData = { idx: i, name: arr[i][4], zodiac: info.zodiac, color: STAR_LABEL_COL, aspect: tex.userData.aspect };
      scene.add(lab); starLabelSprites3d.push(lab);
    }
    applyStarTint3d();
    if (deepOn) setEpoch(deepEpoch);
  }

  // Gold for on-ecliptic nakshatra labels while the rashi band is on; cool white otherwise.
  function setStarLabelColor(lab, color) {
    if (lab.userData.color === color) return;
    lab.userData.color = color;
    if (lab.material.map) lab.material.map.dispose();
    const tex = fittedLabelTexture(i18n.objectName(lab.userData.name), color);
    lab.material.map = tex; lab.userData.aspect = tex.userData.aspect;
    lab.material.needsUpdate = true;
  }
  function applyStarTint3d() {
    for (const lab of starLabelSprites3d) {
      setStarLabelColor(lab, (lab.userData.zodiac && rashiOn) ? ZODIAC_LABEL_COL : STAR_LABEL_COL);
    }
  }

  // HIP -> drifted equatorial unit vector at dt (years from J1991.25), for constellation lines.
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

  // Drift all stars (and the constellation lines) to `year` CE. Star group is still rotated by
  // the uniform-precession matrix in frame(), so stars warp (proper motion) AND the sky precesses.
  function setEpoch(year) {
    deepEpoch = year;
    if (!starP0 || !starsRaw) return;
    const dt = year - 1991.25, attr = starGeom.getAttribute("position"), pos = attr.array;
    for (let i = 0; i < starsRaw.length; i++) {
      const j = i * 3;
      const x = starP0[j] + starV3d[j] * dt, y = starP0[j + 1] + starV3d[j + 1] * dt, z = starP0[j + 2] + starV3d[j + 2] * dt;
      const inv = RADIUS / Math.hypot(x, y, z);
      pos[j] = x * inv; pos[j + 1] = y * inv; pos[j + 2] = z * inv;
    }
    attr.needsUpdate = true;
    _setConstLines(_driftedStarMap(dt));
  }

  // Deep-time mode: hide planets/Sun/Moon + the ecliptic/rashi band (no valid ephemeris far from
  // the present); stars drift and the sky precesses. Off -> restore the J2000 sky exactly.
  function setDeepTime(on) {
    deepOn = on;
    for (const sp of bodySprites.values()) sp.visible = !on;
    for (const lb of bodyLabels.values()) lb.visible = !on;
    eclipticGroup.visible = !on;
    if (on) { setEpoch(deepEpoch); return; }
    if (starBaseBuf) {
      const attr = starGeom.getAttribute("position");
      attr.array.set(starBaseBuf); attr.needsUpdate = true;
    }
    if (lastCons && starsRaw) _setConstLines(overlays.buildStarMap({ stars: starsRaw }));
  }

  let lastSky = null;
  function setSky(skyData) {
    lastSky = skyData;
    for (const b of skyData.bodies) {
      let sprite = bodySprites.get(b.id);
      if (!sprite) {
        sprite = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: true }));
        bodyGroup.add(sprite);
        bodySprites.set(b.id, sprite);
      }
      if (b.id === "sun") sprite.material.map = sunTex;
      else if (b.id === "moon") sprite.material.map = moonTexture((b.phase_percent ?? 50) / 100, true);
      else if (b.id === "saturn") { if (!sprite.material.map) sprite.material.map = saturnTex; }
      else if (!sprite.material.map) sprite.material.map = discTexture("#ffffff", PLANET_COLOR[b.id] || "#ccccff");
      sprite.material.needsUpdate = true;
      const scale = b.id === "sun" || b.id === "moon" ? 6 : b.id === "saturn" ? 5 : 2.4;
      sprite.scale.set(scale, scale, 1);
      sprite.userData.body = b;

      if (!bodyLabels.has(b.id)) {
        // Same texture as the star names (semibold + dark halo, width-fitted) and a matching bright
        // colour, so planet/Sun/Moon labels read consistently with star labels (and the orrery).
        const tex = fittedLabelTexture(i18n.objectName(b.name), "#e8eeff");
        const lab = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true }));
        lab.userData.aspect = tex.userData.aspect;
        bodyGroup.add(lab);
        bodyLabels.set(b.id, lab);
      }
    }
  }

  // Re-bake the body name labels for the current language (called on a language change).
  function relabelBodies() {
    if (lastSky) {
      for (const b of lastSky.bodies) {
        const lab = bodyLabels.get(b.id);
        if (lab) {
          if (lab.material.map) lab.material.map.dispose();
          const tex = fittedLabelTexture(i18n.objectName(b.name), "#e8eeff");
          lab.material.map = tex; lab.userData.aspect = tex.userData.aspect;
          lab.material.needsUpdate = true;
        }
      }
    }
    for (const lab of starLabelSprites3d) {   // re-bake star names in the new language, keep color
      if (lab.material.map) lab.material.map.dispose();
      const tex = fittedLabelTexture(i18n.objectName(lab.userData.name), lab.userData.color);
      lab.material.map = tex; lab.userData.aspect = tex.userData.aspect;
      lab.material.needsUpdate = true;
    }
  }

  // Bodies carry equatorial-of-date ra/dec, so they share the Rashi band's transform
  // (horizontalMatrix only -- NOT the precessing star matrix). Driving them off the SAME
  // advanced-LST matrix as the band keeps planets locked to the band/stars between sky
  // refetches, instead of freezing at the last fetch's alt/az while the sky rotates past them.
  function positionBodies(Hmat) {
    if (!lastSky) return;
    // Screen-up in world space: a fixed world-Y offset only reads as "above" for bodies near the
    // view centre and drifts sideways for the rest (Sun/Moon), so offset along the camera's up.
    const camUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const fwd = camera.getWorldDirection(_camFwd);
    // Fixed on-screen pixel size (matches the 2D font), with the same off-axis depth term as the star
    // labels so a planet name near the screen edge isn't larger than one near the centre at a wide FOV.
    const tanHalf = Math.tan(fov * D2R / 2), vpH = container.clientHeight || 1;
    for (const b of lastSky.bodies) {
      const sprite = bodySprites.get(b.id);
      if (!sprite) continue;
      const v = astro.matVec(Hmat, bodyVec(b));
      sprite.position.set(v[0] * BODY_R, v[1] * BODY_R, v[2] * BODY_R);
      const lab = bodyLabels.get(b.id);
      if (lab) {
        const cosA = Math.max(0.12, v[0] * fwd.x + v[1] * fwd.y + v[2] * fwd.z);
        const hgt = (LABEL_PX / vpH) * 2 * (BODY_R * cosA) * tanHalf;
        lab.scale.set(hgt * lab.userData.aspect, hgt, 1);   // width follows the name (fitted texture)
        // Just above the disc edge with a small, 2D-matching gap. The label's text fills only
        // ~half the sprite height, so use 0.25*label (not 0.5) to sit the visible text near the
        // edge instead of floating high; scales with the sprite, so the gap holds at any zoom.
        const off = sprite.scale.y * 0.5 + lab.scale.y * 0.25 + 0.6;
        lab.position.set(v[0] * BODY_R, v[1] * BODY_R, v[2] * BODY_R).addScaledVector(camUp, off);
      }
    }
  }

  // Atmosphere ON: sky color + star fade from sun altitude (Section 6.6 / Phase 7C-ready).
  function applyAtmosphere(atmosphere) {
    const sun = lastSky && lastSky.bodies.find((b) => b.id === "sun");
    const sunAlt = sun ? (atmosphere ? sun.alt : sun.alt_true) : -90;
    if (atmosphere) {
      const day = Math.max(0, Math.min(1, (sunAlt + 6) / 12));    // -6..+6 deg twilight band
      const night = new THREE.Color(0x05070f), sky = new THREE.Color(0x4a78b8);
      scene.background = night.clone().lerp(sky, day);
      starMat.uniforms.dayFactor.value = 1 - Math.max(0, Math.min(1, (sunAlt + 2) / 8));
      if (ground.material.transparent) {          // back to opaque ground (occludes)
        ground.material.transparent = false;
        ground.material.opacity = 1.0;
        ground.material.depthWrite = true;
        ground.material.needsUpdate = true;
      }
    } else {
      // Geometric space view: black sky, daytime stars, translucent non-occluding ground
      // so below-horizon objects render through it (Phase 7C).
      scene.background = new THREE.Color(0x000000);
      starMat.uniforms.dayFactor.value = 1.0;
      if (!ground.material.transparent) {
        ground.material.transparent = true;
        ground.material.opacity = 0.2;
        ground.material.depthWrite = false;
        ground.material.needsUpdate = true;
      }
    }
  }

  function bodyDescriptor(b) {
    return {
      kind: "body", name: b.name,
      type: b.id === "sun" ? "The Sun" : b.id === "moon" ? "The Moon" : "Planet",
      mag: b.mag, raDeg: b.ra_hours * 15, decDeg: b.dec_deg, alt: b.alt, altTrue: b.alt_true,
      az: b.az, distanceAu: b.distance_au, phasePercent: b.phase_percent, _bodyId: b.id,
    };
  }

  function pickAt(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    // Prefer intentional targets (planets, Messier markers) over the dense star field.
    const sprites = [...bodySprites.values(), ...messierSprites.filter((m) => m.visible)];
    const sh = raycaster.intersectObjects(sprites, false);
    if (sh.length) {
      const o = sh[0].object;
      if (o.userData.body) return bodyDescriptor(o.userData.body);
      const m = o.userData.messier;
      const [alt, az] = vecToAltAz(sh[0].point.x, sh[0].point.y, sh[0].point.z);
      return { kind: "messier", name: `M${m.id}${m.name ? " — " + m.name : ""}`, type: m.type,
        mag: m.mag, raDeg: m.raDeg, decDeg: m.decDeg, alt, az, _ra: m.raDeg, _dec: m.decDeg };
    }
    if (starsRaw) {
      // Tighten the pick radius as you zoom in so close pairs (e.g. Algorab vs HIP 61174) can be told
      // apart, then take the dot ANGULARLY nearest the click (min distanceToRay) -- not intersectObject's
      // default order (nearest to camera), which for a sphere of stars at equal range is arbitrary.
      raycaster.params.Points.threshold = 1.5 * Math.max(0.25, fov / FOV_REF);
      const st = raycaster.intersectObject(starPoints, false);
      if (st.length) {
        let best = st[0];
        for (const h of st) if (h.distanceToRay < best.distanceToRay) best = h;
        const s = starsRaw[best.index];
        const [alt, az] = vecToAltAz(best.point.x, best.point.y, best.point.z);
        return { kind: "star", name: s[4] || undefined, hip: s[0], type: "Star",
          mag: s[3], raDeg: s[1], decDeg: s[2], alt, az, _ra: s[1], _dec: s[2], _starIdx: best.index };
      }
    }
    return null;
  }

  function setSelected(desc) {
    selected = desc; crosshair.visible = !!desc;
    if (markerHidLabel3d) { markerHidLabel3d.visible = true; markerHidLabel3d = null; }   // restore prior
    // Show the orange-red name only for labelless picks (stars/DSOs); bodies already show theirs.
    if (desc && !desc._bodyId && desc.name) {
      const tex = fittedLabelTexture(i18n.objectName(desc.name), "#ff6a3d");
      selLabel.material.map = tex; selLabel.userData.aspect = tex.userData.aspect;
      selLabel.material.needsUpdate = true;
      selLabel.visible = true;
      // If this star already carries a persistent Hindu-name label, hide it so the orange marker
      // replaces it in place -- otherwise the two stack (one by the dot, one above the crosshair).
      if (desc._starIdx != null) {
        markerHidLabel3d = starLabelSprites3d.find((l) => l.userData.idx === desc._starIdx) || null;
        if (markerHidLabel3d) markerHidLabel3d.visible = false;
      }
    } else {
      selLabel.visible = false;
    }
  }

  function findByName(name) {
    const lc = name.toLowerCase();
    if (lastSky) {
      const b = lastSky.bodies.find((x) => x.name.toLowerCase() === lc);
      if (b) return bodyDescriptor(b);
    }
    if (starsRaw) {
      const idx = starsRaw.findIndex((x) => x[4] && x[4].toLowerCase() === lc);
      if (idx >= 0) {
        const s = starsRaw[idx];
        // Match the click path: include current horizontal coords so the info card is identical.
        let alt, az;
        if (lastLst != null) {
          const w = astro.matVec(astro.starGroupMatrix(lastLst, lastLat, lastJd), astro.raDecToVec(s[1], s[2]));
          [alt, az] = vecToAltAz(w[0], w[1], w[2]);
        }
        return { kind: "star", name: s[4], type: "Star", mag: s[3], raDeg: s[1], decDeg: s[2], alt, az, _ra: s[1], _dec: s[2], _starIdx: idx };
      }
    }
    return null;
  }

  // Equatorial unit vector of a selected star at the current epoch: drifted in deep time (so the
  // crosshair/camera stay locked to the moving star), else its J2000 position.
  function _selStarEqVec(d) {
    if (!deepOn || d._starIdx == null || !starP0) return astro.raDecToVec(d._ra, d._dec);
    const j = d._starIdx * 3, dt = deepEpoch - 1991.25;
    const x = starP0[j] + starV3d[j] * dt, y = starP0[j + 1] + starV3d[j + 1] * dt, z = starP0[j + 2] + starV3d[j + 2] * dt;
    const n = Math.hypot(x, y, z) || 1;
    return [x / n, y / n, z / n];
  }
  // Deep-time-aware star-group matrix (uniform precession at the scrubbed epoch when deep).
  function _starM() {
    const jdP = deepOn ? (2451545.0 + (deepEpoch - 2000) * 365.25) : lastJd;
    return astro.starGroupMatrix(lastLst, lastLat, jdP, deepOn);
  }

  // Aim the camera at the current selection (search "center" behaviour, Section 8 item 4).
  function lookAtSelected() {
    if (!selected) return;
    let v = null;
    if (selected._bodyId && lastSky) {
      const b = lastSky.bodies.find((x) => x.id === selected._bodyId);
      if (b) v = astro.matVec(astro.horizontalMatrix(lastLst, lastLat), bodyVec(b));
    } else if (selected._ra != null && lastLst != null) {
      v = astro.matVec(_starM(), _selStarEqVec(selected));
    }
    if (!v) return null;
    tYaw = Math.atan2(v[0], -v[2]); tPitch = Math.asin(Math.max(-1, Math.min(1, v[1])));
    return tPitch * 180 / Math.PI;     // altitude of the target (deg)
  }

  // One frame: update star-group matrix, body positions, atmosphere, render.
  function frame(lstHours, latDeg, simDate, atmosphere = true) {
    lastJd = astro.jdFromDate(simDate); lastLst = lstHours; lastLat = latDeg; lastSimMs = simDate.getTime();
    // Deep time: precess with the uniform model at the scrubbed epoch (stars are already drifted).
    const jdPrec = deepOn ? (2451545.0 + (deepEpoch - 2000) * 365.25) : lastJd;
    const M = astro.starGroupMatrix(lstHours, latDeg, jdPrec, deepOn);
    _m4.set(M[0], M[1], M[2], 0, M[3], M[4], M[5], 0, M[6], M[7], M[8], 0, 0, 0, 0, 1);
    starGroup.matrix.copy(_m4);
    starGroup.matrixWorldNeedsUpdate = true;
    overlayGroup.matrix.copy(_m4);
    overlayGroup.matrixWorldNeedsUpdate = true;
    // Ecliptic/Rashi group: horizontal rotation only (vectors are already of-date).
    const H = astro.horizontalMatrix(lstHours, latDeg);
    _h4.set(H[0], H[1], H[2], 0, H[3], H[4], H[5], 0, H[6], H[7], H[8], 0, 0, 0, 0, 1);
    eclipticGroup.matrix.copy(_h4);
    eclipticGroup.matrixWorldNeedsUpdate = true;
    positionBodies(H);                  // bodies share the band's of-date horizontal transform
    // Place the persistent star labels above their (precessed/drifted) dots at constant on-screen
    // size. Source positions come from the star geometry buffer (drifted in deep time), then the
    // star-group matrix M -- exactly the transform the star points use.
    if (starLabelSprites3d.length) {
      const camUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
      const fwd = camera.getWorldDirection(_camFwd);   // view axis, for camera-space depth
      const tanHalf = Math.tan(fov * D2R / 2), vpH = container.clientHeight || 1;
      const sp = starGeom.getAttribute("position").array;
      for (const lab of starLabelSprites3d) {
        lab.visible = starsOn && lab !== markerHidLabel3d;   // hidden with the star field, or when its star is the search pick
        const j = lab.userData.idx * 3;
        const w = astro.matVec(M, [sp[j] / RADIUS, sp[j + 1] / RADIUS, sp[j + 2] / RADIUS]);
        // World height so the sprite is exactly LABEL_PX tall on screen at its camera-space depth
        // (RADIUS * cos off-axis): screenPx = worldH * vpH / (2*depth*tan(fov/2)). This gives a fixed
        // pixel size like the 2D font -- same size everywhere AND identical across FOV / window size.
        const cosA = Math.max(0.12, w[0] * fwd.x + w[1] * fwd.y + w[2] * fwd.z);
        const hgt = (LABEL_PX / vpH) * 2 * (RADIUS * cosA) * tanHalf;
        lab.scale.set(hgt * lab.userData.aspect, hgt, 1);   // width follows the text so names aren't clipped
        lab.position.set(w[0] * RADIUS, w[1] * RADIUS, w[2] * RADIUS).addScaledVector(camUp, hgt * 0.5 + 0.8);
      }
    }
    applyAtmosphere(atmosphere);
    // Messier labels appear once moderately zoomed in (fov small), to avoid clutter.
    const showMLab = messierOn && fov < 50;
    for (const l of messierLabels) l.visible = showMLab;
    // Track the selection crosshair on its (moving) object.
    if (selected) {
      let pos = null;
      if (selected._bodyId && lastSky) {
        const b = lastSky.bodies.find((x) => x.id === selected._bodyId);
        if (b) { const v = astro.matVec(H, bodyVec(b)); pos = new THREE.Vector3(v[0] * BODY_R, v[1] * BODY_R, v[2] * BODY_R); }
      } else if (selected._ra != null) {
        const w = astro.matVec(M, _selStarEqVec(selected));   // drifted in deep time -> stays on the star
        pos = new THREE.Vector3(w[0] * RADIUS, w[1] * RADIUS, w[2] * RADIUS);
      }
      if (pos) {
        crosshair.position.copy(pos);
        // Size the ring to encircle the target: a small constant ring for star points, but big enough
        // to sit OUTSIDE the Sun/Moon disc (which otherwise swallows a constant-size ring).
        let cs = Math.max(2, camera.position.distanceTo(pos) * 0.05);
        if (selected._bodyId) { const bsp = bodySprites.get(selected._bodyId); if (bsp) cs = Math.max(cs, bsp.scale.x * 2.2); }
        crosshair.scale.setScalar(cs);
        if (selLabel.visible) {   // search name: same fixed on-screen px as the persistent labels
          const camUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
          const fwd = camera.getWorldDirection(_camFwd);
          const vpH = container.clientHeight || 1;
          const depth = Math.max(0.12 * RADIUS, pos.x * fwd.x + pos.y * fwd.y + pos.z * fwd.z);
          const hgt = (LABEL_PX / vpH) * 2 * depth * Math.tan(fov * D2R / 2);
          selLabel.scale.set(hgt * (selLabel.userData.aspect || 4), hgt, 1);
          const off = crosshair.scale.y * 0.5 + selLabel.scale.y * 0.25 + 0.6;
          selLabel.position.copy(pos).addScaledVector(camUp, off);
        }
      }
    }
    applyKeyOrbit();
    applyCamera();
    renderer.render(scene, camera);
  }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  // --- input ---------------------------------------------------------------
  let dragging = false, lastX = 0, lastY = 0;
  const el = renderer.domElement;
  el.addEventListener("pointerdown", (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; el.setPointerCapture(e.pointerId); });
  el.addEventListener("pointerup", (e) => { dragging = false; el.releasePointerCapture(e.pointerId); });
  el.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const k = (fov / 70) * 0.005;
    tYaw -= (e.clientX - lastX) * k;
    tPitch += (e.clientY - lastY) * k;
    tPitch = Math.max(-89.9 * Math.PI / 180, Math.min(89.9 * Math.PI / 180, tPitch));
    lastX = e.clientX; lastY = e.clientY;
  });
  el.addEventListener("wheel", (e) => {
    e.preventDefault();
    fov = Math.max(15, Math.min(120, fov + Math.sign(e.deltaY) * 3));   // up to 120deg = very wide sky
  }, { passive: false });
  // Arrow-key look-around (active only while this view is showing; keyup always releases).
  const ARROWS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);
  window.addEventListener("keydown", (e) => { if (ARROWS.has(e.key) && !container.hidden) { e.preventDefault(); heldKeys.add(e.key); } });
  window.addEventListener("keyup", (e) => { if (ARROWS.has(e.key)) heldKeys.delete(e.key); });
  window.addEventListener("blur", () => heldKeys.clear());
  window.addEventListener("resize", resize);

  return {
    setStars, setSky, setOverlayData, setEcliptic, frame, resize, renderer, scene, camera,
    pickAt, setSelected, findByName, lookAtSelected, relabelBodies, setEpoch, setDeepTime,
    clearSelection: () => setSelected(null),   // hide the crosshair
    // Where you're looking, in exact alt-az + field of view: azimuth (0°=N, 90°=E, left/right),
    // altitude (degrees above the horizon, up/down), FOV (zoom).
    getOrientation() {
      const az = ((yaw * 180 / Math.PI) % 360 + 360) % 360;
      const alt = pitch * 180 / Math.PI;
      return `Az ${az.toFixed(1)}° · Alt ${alt >= 0 ? "+" : ""}${alt.toFixed(1)}° · FOV ${fov.toFixed(0)}°`;
    },
    // PNG export (Phase 9D.4): render once, then read the buffer synchronously.
    snapshot: () => { renderer.render(scene, camera); return renderer.domElement.toDataURL("image/png"); },
    toggleGrid: (v) => { grid.visible = v; },
    toggleConstellations: (v) => {
      if (constLines) constLines.visible = v;
      for (const s of constLabelSprites) s.visible = v;
    },
    toggleRashi: (v) => setRashiVisible(v),
    toggleMessier: (v) => { messierOn = v; for (const m of messierSprites) m.visible = v; },
    toggleStars: (v) => { starsOn = v; starPoints.visible = v; },   // labels gated per-frame by starsOn
    toggleMilkyway: (v) => { if (milkyway) milkyway.visible = v; },
    setVisible: (v) => { renderer.domElement.style.display = v ? "block" : "none"; },
    dispose: () => { renderer.dispose(); container.removeChild(renderer.domElement); },
  };
}
