// Point-at-sky (Android): drive the 3D view from device sensors, showing exactly the sky the
// phone points at (for the app's location + sim time).
//
// Architecture (v3): the GYROSCOPE is the primary orientation source. A quaternion attitude is
// anchored from the first absolute (compass) orientation sample, then integrated from
// devicemotion.rotationRate — gyro integration is velvety-stable and immune to the indoor
// magnetic wander that made compass-driven pointing creep. The compass is folded back in only
// as a slow correction WHILE the phone is physically rotating (motion masks the nudge), so
// long-term gyro drift can't accumulate either. A stillness gate (rotation rate ~0) freezes
// emission entirely at rest. Devices without a gyro fall back to the smoothed compass stream
// with the same freeze/wake hysteresis as before.
//
// Frames: Earth frame x East, y North, z Up (W3C). Device frame x right, y top, z out of the
// screen; the back camera looks along -z. deviceorientation gives intrinsic Z-X'-Y'' angles
// (alpha, beta, gamma); rotationRate.alpha/beta/gamma are angular rates about device z/x/y in
// deg/s. The pointing direction is independent of screen rotation (it is about device z).
import { dlog } from "./debuglog.js";

const D2R = Math.PI / 180;
const SMOOTH = 0.25;                          // no-gyro path: EMA weight for the newest sample
const WAKE = Math.cos(2.0 * D2R);             // no-gyro path: frozen -> live needs >2°
const LIVE = Math.cos(0.3 * D2R);             // no-gyro path: emit resolution
const SETTLE_MS = 1200;                       // no-gyro path: calm -> freeze
const STILL_RATE = 0.8, MOVE_RATE = 2.5, STILL_MS = 400;   // gyro gate (deg/s)
const CORR_RATE = 3.0;                        // compass correction only above this rate (deg/s)
const YAW_BOOST_RATE = 15.0;                  // vigorous motion: yaw correction strengthens with rate
// Correction gains (per orientation event, ~60 Hz). Field logs showed the compass wandering by
// tens of degrees while the phone stood on a table; a uniform 3%/event correction re-converged
// to that garbage within a second of the first touch ("sun jumps to a different direction").
// Split the error: TILT (gravity-referenced, trustworthy) corrects at a ~1 s time constant;
// YAW (the magnetic part) at a ~14 min time constant of *moving* time — Android's rotationRate
// is already bias-calibrated by the OS fusion, so yaw needs almost no correction, and the
// wandering compass must never be able to yank the view (field log: 40°+ indoor wander).
const TILT_GAIN = 0.02, YAW_GAIN = 0.0002;

// --- tiny quaternion kit (w, x, y, z); q maps device -> world: v_w = q ⊗ v_d ⊗ q* ------------
const qmul = (a, b) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];
function qnorm(q) {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}
function qrotNegZ(q) {   // q ⊗ (0,0,-1) ⊗ q* without the full sandwich
  const [w, x, y, z] = q;
  return [-(2 * x * z + 2 * w * y), -(2 * y * z - 2 * w * x), -(w * w - x * x - y * y + z * z)];
}
function qrotY(q) {      // q ⊗ (0,1,0) ⊗ q* — the device's top edge, in world coords
  const [w, x, y, z] = q;
  return [2 * (x * y - w * z), w * w - x * x + y * y - z * z, 2 * (y * z + w * x)];
}
function qFromEuler(aDeg, bDeg, gDeg) {   // R = Rz(alpha) · Rx(beta) · Ry(gamma)
  const a = aDeg * D2R / 2, b = bDeg * D2R / 2, g = gDeg * D2R / 2;
  const qz = [Math.cos(a), 0, 0, Math.sin(a)];
  const qx = [Math.cos(b), Math.sin(b), 0, 0];
  const qy = [Math.cos(g), 0, Math.sin(g), 0];
  return qmul(qmul(qz, qx), qy);
}
const qconj = (q) => [q[0], -q[1], -q[2], -q[3]];
function qscale(q, k) {   // fractional rotation q^k for small k (identity-nlerp, shortest arc)
  const sgn = q[0] < 0 ? -1 : 1;
  return qnorm([1 + (sgn * q[0] - 1) * k, sgn * q[1] * k, sgn * q[2] * k, sgn * q[3] * k]);
}
function nlerp(a, b, t) {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const s = dot < 0 ? -1 : 1;
  return qnorm([
    a[0] + (s * b[0] - a[0]) * t, a[1] + (s * b[1] - a[1]) * t,
    a[2] + (s * b[2] - a[2]) * t, a[3] + (s * b[3] - a[3]) * t,
  ]);
}

export function createPointSky(onOrient) {
  let evName = null, got = false, checkT = null;
  let declRad = 0;
  let yawTrim = 0;        // manual alignment offset (rad), set by dragging in point mode
  let lastVec = null;     // last emitted direction, so a trim re-renders instantly even when frozen
  let held = false;       // finger down in point mode: freeze the sky so alignment is static
  // gyro path
  let q = null;                 // attitude quaternion (device -> world)
  let lastMotionT = 0;
  let gyroSeen = false, rateEma = 0, stillSince = 0, physStill = false;
  // no-gyro fallback path
  let sm = null, emitted = null, live = false, calmSince = 0;
  let logOrient1 = false, logMotion1 = false, lastSummary = 0, emits = 0, corrections = 0;
  let lastYawErr = 0;   // compass-vs-attitude yaw disagreement (deg) at the last correction
  let lastCompass = null;   // last compass-pointing az/alt (deg) for telemetry

  const emitVec = (v) => {
    lastVec = v;
    onOrient(
      Math.atan2(v[0], v[1]) + declRad + yawTrim,
      Math.asin(Math.max(-1, Math.min(1, v[2]))),
    );
  };

  // Full-attitude emit (gyro path): near the nadir/zenith the pointing vector's azimuth is
  // degenerate — spinning a flat phone rotates ABOUT the pointing axis, so az wouldn't budge and
  // the view stays glued to the phone instead of the world. There, take the azimuth from the
  // device's top-edge heading (well-defined exactly when pointing az isn't), blended in over
  // |alt| 65..85° so the handoff is seamless as the phone tilts.
  function emitQ(q_) {
    const pv = qrotNegZ(q_);
    const alt = Math.asin(Math.max(-1, Math.min(1, pv[2])));
    let az = Math.atan2(pv[0], pv[1]);
    const t = Math.min(1, Math.max(0, (Math.abs(alt) / D2R - 65) / 20));
    if (t > 0) {
      const u = qrotY(q_);
      const azU = Math.atan2(u[0], u[1]);
      let d = azU - az;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      az += d * t;
    }
    onOrient(az + declRad, alt);
  }

  function motionHandler(e) {
    const rr = e.rotationRate;
    if (!rr || rr.alpha == null) {
      if (!logMotion1) { logMotion1 = true; dlog("point: devicemotion has NO rotationRate — compass fallback"); }
      return;
    }
    if (!logMotion1) {
      logMotion1 = true;
      dlog("point: gyro ok", `rr=${(rr.alpha || 0).toFixed(2)},${(rr.beta || 0).toFixed(2)},${(rr.gamma || 0).toFixed(2)} deg/s`, `interval=${e.interval}`);
    }
    gyroSeen = true;
    const now = performance.now();
    const dt = lastMotionT ? Math.min(0.1, (now - lastMotionT) / 1000) : 0;
    lastMotionT = now;

    const mag = Math.hypot(rr.alpha || 0, rr.beta || 0, rr.gamma || 0);
    rateEma = rateEma * 0.7 + mag * 0.3;
    if (rateEma > MOVE_RATE) {
      if (physStill) dlog("point: WAKE", `rate=${rateEma.toFixed(1)}`);
      physStill = false; stillSince = 0;
    } else if (rateEma < STILL_RATE) {
      if (!stillSince) stillSince = now;
      else if (now - stillSince > STILL_MS && !physStill) { physStill = true; dlog("point: FREEZE"); }
    } else stillSince = 0;

    if (!q || !dt) return;
    if (physStill) return;                       // at rest: hold attitude, emit nothing
    if (held) {                                  // aligning: integrate silently, render nothing
      q = qnorm(qmul(q, [1, 0.5 * (rr.beta || 0) * D2R * dt, 0.5 * (rr.gamma || 0) * D2R * dt, 0.5 * (rr.alpha || 0) * D2R * dt]));
      return;
    }
    // Integrate body-frame rates (small-angle quaternion step).
    const hx = 0.5 * (rr.beta || 0) * D2R * dt;
    const hy = 0.5 * (rr.gamma || 0) * D2R * dt;
    const hz = 0.5 * (rr.alpha || 0) * D2R * dt;
    q = qnorm(qmul(q, [1, hx, hy, hz]));
    emits++;
    emitQ(q);
    if (now - lastSummary > 1000) {
      lastSummary = now;
      const v = qrotNegZ(q);
      dlog("point:", `src=gyro rate=${rateEma.toFixed(2)} still=${physStill} emits=${emits} corr=${corrections}`,
        `az=${(Math.atan2(v[0], v[1]) / D2R).toFixed(1)} alt=${(Math.asin(v[2]) / D2R).toFixed(1)}`,
        `cAz=${lastCompass ? lastCompass[0].toFixed(1) : "?"} cAlt=${lastCompass ? lastCompass[1].toFixed(1) : "?"}`,
        `yawErr=${lastYawErr.toFixed(1)}`);
      emits = 0; corrections = 0;
    }
  }

  function orientHandler(e) {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    got = true;
    if (!logOrient1) {
      logOrient1 = true;
      dlog("point: orientation ok", `ev=${evName}`, `absolute=${e.absolute}`,
        `abg=${e.alpha.toFixed(1)},${e.beta.toFixed(1)},${e.gamma.toFixed(1)}`);
    }
    const qc = qFromEuler(e.alpha, e.beta, e.gamma);
    const cpv = qrotNegZ(qc);
    lastCompass = [Math.atan2(cpv[0], cpv[1]) / D2R, Math.asin(Math.max(-1, Math.min(1, cpv[2]))) / D2R];

    if (gyroSeen) {
      // Gyro path: compass only anchors once, then corrects gently while moving — with the
      // error split into a gravity part (tilt/roll, corrected normally) and a magnetic part
      // (rotation about world-up, corrected ~30x weaker so wander can never yank the view).
      if (!q) { q = qc; emitQ(q); return; }
      {
        let qe = qmul(qc, qconj(q));                 // error rotation, world frame
        if (qe[0] < 0) qe = qe.map((x) => -x);       // shortest arc
        const tn = Math.hypot(qe[0], qe[3]);
        const twist = tn > 1e-9 ? [qe[0] / tn, 0, 0, qe[3] / tn] : [1, 0, 0, 0];  // about world z
        const swing = qmul(qe, qconj(twist));        // the remaining (gravity-referenced) part
        lastYawErr = 2 * Math.acos(Math.min(1, Math.abs(twist[0]))) / D2R;
        // TILT corrects always — gravity is trustworthy even at rest, and silent correction
        // while frozen means the view wakes already-level (gyro tilt drift can't accumulate).
        // YAW corrects only while moving, with a gain that GROWS with rotation rate: a
        // deliberate sweep (figure-8) averages magnetic noise, so a garbage anchor heals in
        // seconds of waving — while at slow rates the gain stays tiny and wander can't creep.
        let qNew = qmul(qscale(swing, TILT_GAIN), q);
        if (!physStill && rateEma > CORR_RATE) {
          const kYaw = YAW_GAIN + Math.max(0, rateEma - YAW_BOOST_RATE) / 60 * 0.004;
          qNew = qmul(qscale(twist, Math.min(0.02, kYaw)), qNew);
          corrections++;
        }
        q = qnorm(qNew);
      }
      return;
    }

    // ---- no-gyro fallback: smoothed compass with freeze/wake hysteresis ----
    const v = qrotNegZ(qc);
    if (!sm) sm = v;
    else {
      for (let i = 0; i < 3; i++) sm[i] = sm[i] * (1 - SMOOTH) + v[i] * SMOOTH;
      const n = Math.hypot(sm[0], sm[1], sm[2]) || 1;
      for (let i = 0; i < 3; i++) sm[i] /= n;
    }
    const emit = () => { emitted = [...sm]; emitVec(sm); };
    const now = performance.now();
    if (!emitted) { emit(); live = true; calmSince = now; return; }
    const d = sm[0] * emitted[0] + sm[1] * emitted[1] + sm[2] * emitted[2];
    if (!live) { if (d < WAKE) { live = true; calmSince = now; emit(); } return; }
    if (d < LIVE) { emit(); calmSince = now; }
    else if (now - calmSince > SETTLE_MS) live = false;
  }

  return {
    // onNoSensor fires if nothing arrives within 2 s; onRelative fires once when only the
    // non-compass fallback exists (gyro-anchored azimuth may then have an arbitrary origin).
    start(onNoSensor, onRelative) {
      if (evName) return true;
      const absolute = "ondeviceorientationabsolute" in window;
      evName = absolute ? "deviceorientationabsolute" : "deviceorientation";
      got = false; q = null; lastMotionT = 0; yawTrim = 0; lastVec = null; held = false;
      gyroSeen = false; rateEma = 0; stillSince = 0; physStill = false;
      sm = null; emitted = null; live = false; calmSince = 0;
      if (!absolute && onRelative) onRelative();
      logOrient1 = false; logMotion1 = false; lastSummary = 0; emits = 0; corrections = 0;
      dlog("point: start", `ev=${evName}`, `decl=${(declRad / D2R).toFixed(2)}deg`);
      window.addEventListener(evName, orientHandler, true);
      window.addEventListener("devicemotion", motionHandler, true);
      checkT = setTimeout(() => { if (!got && onNoSensor) onNoSensor(); }, 2000);
      return true;
    },
    stop() {
      if (!evName) return;
      window.removeEventListener(evName, orientHandler, true);
      window.removeEventListener("devicemotion", motionHandler, true);
      clearTimeout(checkT);
      evName = null;
    },
    get active() { return evName != null; },
    setDeclination(rad) { declRad = rad || 0; dlog("point: declination", `${(declRad / D2R).toFixed(2)}deg`); },
    // Manual yaw alignment (drag): applied on top of compass+declination; re-emits immediately
    // so the sky follows the finger even while the stillness gate has emission frozen.
    nudgeYaw(rad) {
      yawTrim += rad;
      if (lastVec) emitVec(lastVec);
    },
    // Finger down: sky freezes (a static target is far easier to align); attitude still
    // integrates, and release re-emits so any real rotation during the drag catches up.
    setHold(on) {
      held = !!on;
      if (!held && q) emitVec(qrotNegZ(q));
      else if (!held && lastVec) emitVec(lastVec);
    },
    get yawTrimDeg() { return yawTrim / D2R; },
    // Live diagnostics for the HUD: which source is driving and what the gyro sees.
    status() {
      return {
        source: gyroSeen ? "gyro" : "compass",
        rate: rateEma,
        frozen: gyroSeen ? physStill : !live,
      };
    },
  };
}
