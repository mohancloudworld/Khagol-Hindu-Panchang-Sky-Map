// ui.js -- shared UI controls. Phase 7: the view segmented control. Time/location/toggle
// controls are added in later phases.

import * as state from "./state.js";
import * as api from "./api.js";

const LABELS = {
  "3d": "3D Sky", "2d": "2D Dome", orrery: "Solar System",
  panchang: "Panchang", kundali: "Kundali",
};

// Build the segmented view switcher. `views` is the ordered list of enabled view keys.
export function createViewBar(container, views) {
  const bar = document.createElement("div");
  bar.className = "view-bar";
  const buttons = {};
  for (const v of views) {
    const b = document.createElement("button");
    b.textContent = LABELS[v] || v;
    b.dataset.view = v;
    b.addEventListener("click", () => state.set("view", v));
    bar.appendChild(b);
    buttons[v] = b;
  }
  container.appendChild(bar);

  const sync = (v) => {
    for (const k in buttons) buttons[k].classList.toggle("active", k === v);
  };
  state.subscribe("view", sync);
  sync(state.get("view"));
  return bar;
}

// (wallToUtc / utcToWall now live in state.js -- the single owner of the time invariant.)

// Smart 24h mask applied live as the user types: digits auto-format to "HH:MM". A leading
// 3-9 (can't begin a two-digit hour) pads to "0X:" and advances to minutes, mirroring the
// old native picker. Returns the partial-but-tidy string to write back into the input.
export function maskTime(raw) {
  const d = raw.replace(/\D/g, "").slice(0, 4);
  if (!d) return "";
  let h, rest;
  if (d[0] >= "3") { h = "0" + d[0]; rest = d.slice(1); }           // 3-9 -> single-digit hour
  else if (d.length === 1) return d;                               // 0/1/2 -> await 2nd digit
  else if (+d.slice(0, 2) <= 23) { h = d.slice(0, 2); rest = d.slice(2); }
  else { h = "0" + d[0]; rest = d.slice(1); }                      // e.g. 25 -> 02, push to min
  let m = rest.slice(0, 2);
  if (m.length === 1 && m > "5") m = "0" + m;                      // 7 -> 07
  if (m.length === 2 && +m > 59) m = "59";
  return m.length ? `${h}:${m}` : `${h}:`;
}

// Finalize whatever is in the field to a valid "HH:MM" (blank -> "00:00"); used on commit.
export function normTime(raw) {
  const m = maskTime(raw).match(/^(\d{1,2}):?(\d{0,2})$/);
  if (!m) return "00:00";
  const hh = String(Math.min(23, +m[1])).padStart(2, "0");
  const mm = (m[2] || "0").padStart(2, "0").slice(0, 2);
  return `${hh}:${mm}`;
}

// Offline city autocomplete: wires a text <input> to /api/geocode; calls onPick({name,
// country, lat, lon, tz}) when a suggestion is chosen.
export function setupCityAutocomplete(input, onPick) {
  const dl = document.createElement("datalist");
  dl.id = `city-dl-${Math.random().toString(36).slice(2)}`;
  input.setAttribute("list", dl.id);
  input.setAttribute("autocomplete", "off");
  input.after(dl);
  let map = new Map(), timer = null;
  input.addEventListener("input", () => {
    const q = input.value.trim();
    // Picking a datalist option fires 'input' with the full label -- detect it here and select
    // immediately, BEFORE the debounced re-fetch rebuilds the map (which would lose the match). Keep
    // the chosen name in the field (the app's setPlace also writes it) instead of clearing it.
    if (map.has(q)) { onPick(map.get(q)); return; }
    clearTimeout(timer);
    if (q.length < 2) return;
    timer = setTimeout(async () => {
      try {
        const r = await api.fetchGeocode(q);
        map = new Map();
        dl.innerHTML = r.results.map((c) => {
          const label = `${c.name}${c.admin1 ? ", " + c.admin1 : ""}, ${c.country}`;
          map.set(label, c);
          return `<option value="${label}"></option>`;
        }).join("");
      } catch { /* ignore */ }
    }, 200);
  });
  input.addEventListener("change", () => {
    const c = map.get(input.value.trim());
    if (c) onPick(c);   // keep the selected city name in the field
  });
}

// Location + date/time control bar shared by ALL views (sky, Panchang, Kundali). In Kundali
// the same fields mean the BIRTH place/time, and the Node + Ayanamsa group (hidden elsewhere)
// becomes visible. `cb` callbacks:
//   onLocation(lat, lon), onTime() [after sim time jumps], onNow(), onCast() [Kundali re-cast].
export function createControlBar(host, cb) {
  const bar = document.createElement("div");
  bar.className = "control-bar";
  bar.innerHTML = `
    <span class="cb-grp">
      <label>City<input type="text" id="cb-city" placeholder="search city…"></label>
      <label>Lat<input type="number" id="cb-lat" step="0.0001"></label>
      <label>Lon<input type="number" id="cb-lon" step="0.0001"></label>
      <button id="cb-here" title="use my location">📍 Here</button>
      <span id="cb-tz" class="cb-tz"></span>
    </span>
    <span class="cb-grp">
      <label>Date<input type="date" id="cb-date"></label>
      <label>Time (24h)<input type="text" id="cb-time" placeholder="HH:MM" maxlength="5" inputmode="numeric"></label>
      <button id="cb-now" title="back to live now">Now</button>
      <button id="cb-fmt" title="toggle 12h / 24h clock"></button>
    </span>
    <span class="cb-grp cb-kundali" hidden>
      <label>Node<select id="cb-node"><option value="mean">Mean</option><option value="true">True</option></select></label>
      <label>Ayanamsa<select id="cb-aya"><option value="lahiri">Lahiri</option><option value="raman">Raman</option><option value="kp">KP</option></select></label>
      <span class="cb-note">↑ birth place &amp; time · stays on this device</span>
    </span>`;
  host.appendChild(bar);
  const lat = bar.querySelector("#cb-lat"), lon = bar.querySelector("#cb-lon");
  const cityEl = bar.querySelector("#cb-city");
  const dateEl = bar.querySelector("#cb-date"), timeEl = bar.querySelector("#cb-time");
  const nodeEl = bar.querySelector("#cb-node"), ayaEl = bar.querySelector("#cb-aya");
  const kgrp = bar.querySelector(".cb-kundali");
  const tzEl = bar.querySelector("#cb-tz");

  lat.value = state.get("lat").toFixed(4);
  lon.value = state.get("lon").toFixed(4);
  tzEl.textContent = state.get("tz");

  setupCityAutocomplete(bar.querySelector("#cb-city"), (c) => {
    lat.value = c.lat.toFixed(4); lon.value = c.lon.toFixed(4);
    cb.onLocation(c.lat, c.lon, c);   // pass the city (name + tz) so the app sets tz + a place label
  });

  const commitLoc = () => {
    const la = parseFloat(lat.value), lo = parseFloat(lon.value);
    if (isFinite(la) && isFinite(lo)) cb.onLocation(la, lo);
  };
  lat.onchange = commitLoc;
  lon.onchange = commitLoc;
  bar.querySelector("#cb-here").onclick = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((p) => {
      lat.value = p.coords.latitude.toFixed(4); lon.value = p.coords.longitude.toFixed(4); commitLoc();
    });
  };
  // Live mask while typing (6 -> "06:" -> minutes), normalize on blur to HH:MM.
  timeEl.addEventListener("input", () => { timeEl.value = maskTime(timeEl.value); });
  const inKundali = () => state.get("view") === "kundali";
  const fillTimeFields = (simDate) => {
    const w = state.utcToWall(simDate, state.get("tz"));
    dateEl.value = w.slice(0, 10); timeEl.value = w.slice(11, 16);
  };
  // Date and Time are INDEPENDENT: set either alone and the blank half fills from the current
  // instant, then the moment is pinned. Sky/Panchang freeze (rate 0) so the field stays accurate;
  // in Kundali these are the BIRTH fields (no freeze -- just re-cast).
  const commitTime = () => {
    const cur = state.utcToWall(state.simTime(), state.get("tz"));
    const date = dateEl.value || cur.slice(0, 10);
    const time = timeEl.value.trim() ? normTime(timeEl.value) : cur.slice(11, 16);
    dateEl.value = date; timeEl.value = time;
    state.setWallTime(`${date}T${time}`);
    if (!inKundali()) state.set("timeFlowRate", 0);
    cb.onTime();
  };
  dateEl.onchange = commitTime;
  timeEl.onchange = commitTime;
  bar.querySelector("#cb-now").onclick = () => {
    state.resetToNow();
    if (inKundali()) { dateEl.value = ""; timeEl.value = ""; }   // birth fields stay empty
    else fillTimeFields(state.simTime());                        // populate with the live now
    cb.onNow();
  };
  const fmtBtn = bar.querySelector("#cb-fmt");
  const syncFmt = () => { fmtBtn.textContent = state.get("timeFormat"); };
  fmtBtn.onclick = () => {
    const nf = state.get("timeFormat") === "12h" ? "24h" : "12h";
    try { localStorage.setItem("timeFormat", nf); } catch { /* ignore */ }
    state.set("timeFormat", nf); syncFmt();
  };
  syncFmt();

  // Node / Ayanamsa mirror the GLOBAL settings (single source of truth in state); a change
  // here updates state + re-casts, and the settings panel reflects it (and vice-versa).
  nodeEl.value = state.get("node"); ayaEl.value = state.get("ayanamsa");
  nodeEl.onchange = () => { state.set("node", nodeEl.value); cb.onCast && cb.onCast(); };
  ayaEl.onchange = () => { state.set("ayanamsa", ayaEl.value); cb.onCast && cb.onCast(); };
  state.subscribe("node", (v) => { if (nodeEl.value !== v) nodeEl.value = v; });
  state.subscribe("ayanamsa", (v) => { if (ayaEl.value !== v) ayaEl.value = v; });

  state.subscribe("tz", (v) => { tzEl.textContent = v; });
  state.subscribe("lat", (v) => { if (document.activeElement !== lat) lat.value = v.toFixed(4); });
  state.subscribe("lon", (v) => { if (document.activeElement !== lon) lon.value = v.toFixed(4); });
  // One shared location + date/time across ALL views (Kundali included): every view mirrors the
  // current instant in the fields. Kundali just reveals the Node/Ayanamsa group and casts for the
  // same shared date/time/place -- no separate birth (pin a date to view any chart).
  const applyView = (v) => {
    kgrp.hidden = (v !== "kundali");
    fillTimeFields(state.simTime());
  };
  state.subscribe("view", applyView);
  applyView(state.get("view"));   // also the initial populate (or clear, if first view is Kundali)

  // Normalized "HH:MM" (24h) from the time field, or "00:00" when blank.
  const wallTime = () => normTime(timeEl.value);

  return {
    setLatLon(la, lo) { lat.value = la.toFixed(4); lon.value = lo.toFixed(4); },
    setPlace(label) { cityEl.value = label || ""; },   // show the current place name (coords stay in Lat/Lon)
    setDateTime(date) { fillTimeFields(date); },   // pin the fields to a specific instant
    setNow() { if (!inKundali()) fillTimeFields(state.simTime()); },   // remote "now": populate, stay live
    // Keep the fields showing the moving instant while time flows (not frozen / not Kundali / not
    // while the user is editing a field). Called from the render loop.
    tickTime() {
      if (inKundali() || state.get("timeFlowRate") === 0) return;
      if (document.activeElement === dateEl || document.activeElement === timeEl) return;
      fillTimeFields(state.simTime());
    },
    // Set the date/time fields directly from a location-local wall clock (Kundali birth
    // restore) and record it as the anchor so the sky clock matches the chart instant.
    setWall(date, time) {
      dateEl.value = date || ""; timeEl.value = time || "";
      if (date) state.setWallTime(`${date}T${normTime(time || "00:00")}`);
    },
    setNode(v) { if (v) nodeEl.value = v; },
    setAyanamsa(v) { if (v) ayaEl.value = v; },
    getNode() { return nodeEl.value; },
    getAyanamsa() { return ayaEl.value; },
    // Current Kundali birth inputs (location-local wall clock + node/ayanamsa).
    getBirth() {
      return { date: dateEl.value, time: wallTime(), node: nodeEl.value, ayanamsa: ayaEl.value };
    },
  };
}

// Toggle buttons. `defs`: [{label, get, set, views?}]. `views` (optional) lists the view
// keys a control applies to; buttons are greyed out/disabled in other views.
export function createOverlayBar(host, defs) {
  const bar = document.createElement("div");
  bar.className = "overlay-bar";
  const items = [];
  for (const d of defs) {
    const b = document.createElement("button");
    b.textContent = d.label;
    const sync = () => b.classList.toggle("on", d.get());
    b.addEventListener("click", () => { if (!b.disabled) { d.set(!d.get()); sync(); } });
    sync();
    bar.appendChild(b);
    items.push({ b, views: d.views, sync });
  }
  const applyView = (v) => {
    bar.hidden = (v === "panchang" || v === "kundali");   // sky-only controls
    for (const it of items) {
      const ok = !it.views || it.views.includes(v);
      it.b.disabled = !ok;
      it.b.classList.toggle("disabled", !ok);
    }
  };
  state.subscribe("view", applyView);
  applyView(state.get("view"));
  host.appendChild(bar);
  return bar;
}
