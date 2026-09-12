// Magnetic declination from the World Magnetic Model 2025 (NOAA/BGS, public domain), evaluated
// offline from the bundled coefficients (data/wmm2025.json). Point-at-sky needs it because the
// device compass references MAGNETIC north; true-north azimuth = magnetic azimuth + declination
// (declination positive east). Faithful JS port of NOAA's legacy WMM C code (as in pygeomag):
// coefficients Schmidt-normalized once at load, then the legacy recursion in calculate().
// Validated against the pygeomag reference (see the geomag validation harness).
const D2R = Math.PI / 180;

let M = null;   // { epoch, size, maxord, c, cd, snorm, fn, fm, k }

export async function loadModel(fetchJson) {
  if (M) return M;
  const raw = await fetchJson("/data/wmm2025.json");
  const maxord = 12, size = maxord + 1;
  const mat = () => Array.from({ length: size }, () => new Float64Array(size));
  const c = mat(), cd = mat(), k = mat();
  const snorm = new Float64Array(size * size);
  const fn = new Float64Array(size), fm = new Float64Array(size);

  for (const [n, m, gnm, hnm, dgnm, dhnm] of raw.coeffs) {
    if (m > maxord) break;
    c[m][n] = gnm; cd[m][n] = dgnm;
    if (m !== 0) { c[n][m - 1] = hnm; cd[n][m - 1] = dhnm; }
  }

  // Schmidt-normalize the coefficients (legacy geomag.c _load_coefficients).
  snorm[0] = 1; fm[0] = 0;
  for (let n = 1; n <= maxord; n++) {
    snorm[n] = snorm[n - 1] * (2 * n - 1) / n;
    let j = 2;
    for (let m = 0; m <= n; m++) {
      k[m][n] = ((n - 1) * (n - 1) - m * m) / ((2 * n - 1) * (2 * n - 3));
      if (m > 0) {
        const flnmj = ((n - m + 1) * j) / (n + m);
        snorm[n + m * size] = snorm[n + (m - 1) * size] * Math.sqrt(flnmj);
        j = 1;
        c[n][m - 1] = snorm[n + m * size] * c[n][m - 1];
        cd[n][m - 1] = snorm[n + m * size] * cd[n][m - 1];
      }
      c[m][n] = snorm[n + m * size] * c[m][n];
      cd[m][n] = snorm[n + m * size] * cd[m][n];
    }
    fn[n] = n + 1; fm[n] = n;
  }
  k[1][1] = 0;

  M = { epoch: raw.epoch, size, maxord, c, cd, snorm, fn, fm, k };
  return M;
}

// Declination in DEGREES (positive east) at geodetic lat/lon (deg), sea level, decimal year.
export function declination(glat, glon, time) {
  if (!M) throw new Error("WMM model not loaded");
  const { epoch, size, maxord, c, cd, snorm, fn, fm, k } = M;
  const alt = 0;
  const dt = time - epoch;

  const a = 6378.137, b = 6356.7523142, re = 6371.2;
  const a2 = a * a, b2 = b * b, c2 = a2 - b2, a4 = a2 * a2, b4 = b2 * b2, c4 = a4 - b4;

  const rlon = glon * D2R, rlat = glat * D2R;
  const srlon = Math.sin(rlon), srlat = Math.sin(rlat);
  const crlon = Math.cos(rlon), crlat = Math.cos(rlat);
  const srlat2 = srlat * srlat, crlat2 = crlat * crlat;

  const sp = new Float64Array(size), cp = new Float64Array(size), pp = new Float64Array(size);
  sp[0] = 0; cp[0] = 1; pp[0] = 1;
  sp[1] = srlon; cp[1] = crlon;
  for (let m = 2; m <= maxord; m++) {
    sp[m] = sp[1] * cp[m - 1] + cp[1] * sp[m - 1];
    cp[m] = cp[1] * cp[m - 1] - sp[1] * sp[m - 1];
  }

  // Geodetic -> spherical (legacy formulas; ca/sa rotate the result back at the end).
  const q = Math.sqrt(a2 - c2 * srlat2);
  const q1 = alt * q;
  const q2 = ((q1 + a2) / (q1 + b2)) * ((q1 + a2) / (q1 + b2));
  const ct = srlat / Math.sqrt(q2 * crlat2 + srlat2);
  const st = Math.sqrt(1 - ct * ct);
  const r2 = alt * alt + 2 * q1 + (a4 - c4 * srlat2) / (q * q);
  const r = Math.sqrt(r2);
  const d = Math.sqrt(a2 * crlat2 + b2 * srlat2);
  const ca = (alt + d) / r;
  const sa = (c2 * crlat * srlat) / (r * d);

  const p = Float64Array.from(snorm);            // working Legendre store (seeded with snorm)
  const dp = Array.from({ length: size }, () => new Float64Array(size));
  const tc = Array.from({ length: size }, () => new Float64Array(size));
  dp[0][0] = 0;

  const aor = re / r;
  let ar = aor * aor;
  let br = 0, bt = 0, bp = 0, bpp = 0;

  for (let n = 1; n <= maxord; n++) {
    ar *= aor;
    for (let m = 0; m <= n; m++) {
      if (n === m) {
        p[n + m * size] = st * p[n - 1 + (m - 1) * size];
        dp[m][n] = st * dp[m - 1][n - 1] + ct * p[n - 1 + (m - 1) * size];
      } else if (n === 1 && m === 0) {
        p[n + m * size] = ct * p[n - 1 + m * size];
        dp[m][n] = ct * dp[m][n - 1] - st * p[n - 1 + m * size];
      } else if (n > 1) {
        if (m > n - 2) { p[n - 2 + m * size] = 0; dp[m][n - 2] = 0; }
        p[n + m * size] = ct * p[n - 1 + m * size] - k[m][n] * p[n - 2 + m * size];
        dp[m][n] = ct * dp[m][n - 1] - st * p[n - 1 + m * size] - k[m][n] * dp[m][n - 2];
      }

      tc[m][n] = c[m][n] + dt * cd[m][n];
      if (m !== 0) tc[n][m - 1] = c[n][m - 1] + dt * cd[n][m - 1];

      const par = ar * p[n + m * size];
      let temp1, temp2;
      if (m === 0) { temp1 = tc[m][n] * cp[m]; temp2 = tc[m][n] * sp[m]; }
      else {
        temp1 = tc[m][n] * cp[m] + tc[n][m - 1] * sp[m];
        temp2 = tc[m][n] * sp[m] - tc[n][m - 1] * cp[m];
      }
      bt -= ar * temp1 * dp[m][n];
      bp += fm[m] * temp2 * par;
      br += fn[n] * temp1 * par;

      // Poles: the bp/st division blows up; the legacy code sums a special series instead.
      if (st === 0 && m === 1) {
        pp[n] = n === 1 ? pp[n - 1] : ct * pp[n - 1] - k[m][n] * pp[n - 2];
        bpp += fm[m] * temp2 * ar * pp[n];
      }
    }
  }
  bp = st === 0 ? bpp : bp / st;

  // Rotate to geodetic: bx north, by east; declination = atan2(east, north).
  const bx = -bt * ca - br * sa;
  const by = bp;
  return Math.atan2(by, bx) / D2R;
}
