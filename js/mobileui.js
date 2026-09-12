// App chrome (Phase 11): the compact, Android-style shell — the ONLY UI on every target
// (Android app, browser extension, any window size). It rebuilds the shell with mobile idioms
// while REUSING the existing controls: the control bar and overlay bar are built into the
// hidden #top-bars staging area by main.js, then physically relocated (appendChild) into
// bottom sheets here, so every input keeps its original wiring.
//
//   ┌──────────────────────────────┐
//   │ 🔍  📍 Ujjain · 21:04 IST  ⚙ │   top status strip (tap = place/time sheet)
//   │                              │
//   │           sky view           │   floating: 🔭 layers (sky views only)
//   │                              │
//   ├──────────────────────────────┤
//   │ 3D · 2D · Solar · Pan · Kun  │   bottom nav (thumb zone)
//   └──────────────────────────────┘
import * as state from "./state.js";

const VIEWS = [
  ["3d", "🌌", "3D Sky"],
  ["2d", "🌐", "2D Dome"],
  ["orrery", "🪐", "Solar"],
  ["panchang", "📅", "Panchang"],
  ["kundali", "🕉", "Kundali"],
  ["match", "💍", "Match"],
];

export function setupMobileChrome() {
  document.body.classList.add("mobile");   // already in app.html's markup; kept for safety

  // --- generic bottom sheet ------------------------------------------------
  function makeSheet(title) {
    const back = document.createElement("div");
    back.className = "m-sheet-back";
    back.hidden = true;
    const sheet = document.createElement("div");
    sheet.className = "m-sheet";
    sheet.innerHTML = `<div class="m-sheet-grip"></div><div class="m-sheet-title">${title}</div><div class="m-sheet-body"></div>`;
    back.appendChild(sheet);
    document.body.appendChild(back);
    const api = {
      body: sheet.querySelector(".m-sheet-body"),
      onClose: null,
      open() { closeAll(); back.hidden = false; requestAnimationFrame(() => back.classList.add("open")); },
      close() { back.classList.remove("open"); back.hidden = true; if (api.onClose) api.onClose(); },
      get isOpen() { return !back.hidden; },
    };
    back.addEventListener("click", (e) => { if (e.target === back) api.close(); });
    // Keyboard: once the IME resizes the viewport, scroll the focused field into view inside
    // the sheet (the OS animation takes a moment, hence the delay).
    sheet.addEventListener("focusin", (e) => {
      const el = e.target;
      if (el && (el.tagName === "INPUT" || el.tagName === "SELECT")) {
        setTimeout(() => { try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch { /* older webview */ } }, 250);
      }
    });
    sheets.push(api);
    return api;
  }
  const sheets = [];
  const closeAll = () => sheets.forEach((s) => s.close());

  // --- hide-menus handle -----------------------------------------------------
  // Search + settings live INSIDE the top strip (relocated below), so hiding the strip and
  // bottom nav clears the screen for the sky -- this handle is the one thing that always
  // stays reachable to bring them back.
  const mHandle = document.createElement("button");
  mHandle.type = "button";
  mHandle.id = "m-bars-handle";
  document.body.appendChild(mHandle);
  const syncHandle = () => {
    const hidden = document.body.classList.contains("bars-hidden");
    mHandle.textContent = hidden ? "▼" : "▲";
    mHandle.title = hidden ? "Show menus" : "Hide menus";
  };
  mHandle.addEventListener("click", () => {
    closeAll();   // an open sheet over a hidden strip/nav would be stranded
    document.body.classList.toggle("bars-hidden");
    syncHandle();
  });
  syncHandle();

  // --- top status strip ----------------------------------------------------
  const strip = document.createElement("div");
  strip.id = "m-strip";
  strip.innerHTML = `
    <button id="m-search-btn" type="button" aria-label="search">🔍</button>
    <button id="m-summary" type="button"><span class="m-place">…</span><span class="m-time">…</span></button>
    <span id="m-gear-slot"></span>`;
  document.body.appendChild(strip);

  // search row: the existing search box (with its datalist wiring) moves in whole
  const searchRow = document.createElement("div");
  searchRow.id = "m-search-row";
  searchRow.hidden = true;
  document.body.appendChild(searchRow);
  const searchBox = document.querySelector(".search-box");
  if (searchBox) searchRow.appendChild(searchBox);
  // The native datalist dropdown on Android shows the ENTIRE object list on focus, covering the
  // keyboard. Replace it with a compact filtered list (max 8) rendered under the search bar.
  const sInput = searchBox?.querySelector("input");
  const sList = searchBox?.querySelector("datalist");
  if (sInput && sList) {
    sInput.removeAttribute("list");
    const sug = document.createElement("div");
    sug.id = "m-suggest";
    searchRow.appendChild(sug);
    const renderSug = () => {
      const q = sInput.value.trim().toLowerCase();
      sug.innerHTML = "";
      if (q.length < 1) return;
      const names = [...sList.options].map((o) => o.value);
      const starts = names.filter((n) => n.toLowerCase().startsWith(q));
      const contains = names.filter((n) => !n.toLowerCase().startsWith(q) && n.toLowerCase().includes(q));
      for (const n of [...starts, ...contains].slice(0, 8)) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = n;
        b.onclick = () => {
          sInput.value = n;
          sug.innerHTML = "";
          sInput.dispatchEvent(new Event("change", { bubbles: false }));
          searchRow.hidden = true;
        };
        sug.appendChild(b);
      }
    };
    sInput.addEventListener("input", renderSug);
  }
  strip.querySelector("#m-search-btn").onclick = () => {
    searchRow.hidden = !searchRow.hidden;
    if (searchRow.hidden) { if (sInput) sInput.value = ""; const g = document.getElementById("m-suggest"); if (g) g.innerHTML = ""; }
    else sInput?.focus();
  };

  // the settings gear relocates into the strip (was a bottom-corner float)
  const gear = document.querySelector(".settings-gear");
  if (gear) strip.querySelector("#m-gear-slot").appendChild(gear);

  // --- place & time sheet (receives the whole control bar) ------------------
  const placeSheet = makeSheet("Place & time");
  const controlBar = document.querySelector(".control-bar");
  if (controlBar) placeSheet.body.appendChild(controlBar);
  // The timezone chip is wide ("America/Chicago") — as a row item it forced wrapping. It moves
  // into the City label's header line ("City            tz: America/Chicago"), so the location
  // row (City · Lat · Lon · Here) fits one line even in portrait.
  const tzEl = document.getElementById("cb-tz");
  const cityInput = document.getElementById("cb-city");
  if (tzEl && cityInput) {
    const lbl = cityInput.closest("label");
    const head = document.createElement("span");
    head.className = "m-city-head";
    while (lbl.firstChild && lbl.firstChild !== cityInput) head.appendChild(lbl.firstChild);
    head.appendChild(tzEl);
    lbl.insertBefore(head, cityInput);
  }
  strip.querySelector("#m-summary").onclick = () => (placeSheet.isOpen ? placeSheet.close() : placeSheet.open());

  // (Typed Y/M/D date entry is part of the control bar itself now -- see datefield.js.)

  // --- layers sheet (receives the overlay toggle bar) -----------------------
  const layersSheet = makeSheet("Sky layers & modes");
  const overlayBar = document.querySelector(".overlay-bar");
  if (overlayBar) layersSheet.body.appendChild(overlayBar);
  // --- bottom navigation (layers rides along as a contextual 6th tab) --------
  const nav = document.createElement("nav");
  nav.id = "m-nav";
  for (const [key, icon, label] of VIEWS) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.view = key;
    b.innerHTML = `<span class="m-nav-ic">${icon}</span><span class="m-nav-lb">${label}</span>`;
    b.onclick = () => { closeAll(); state.set("view", key); };
    nav.appendChild(b);
  }
  const layersBtn = document.createElement("button");
  layersBtn.type = "button";
  layersBtn.id = "m-nav-layers";
  layersBtn.innerHTML = `<span class="m-nav-ic">🔭</span><span class="m-nav-lb">Layers ▴</span>`;
  layersBtn.onclick = () => {
    if (layersSheet.isOpen) layersSheet.close();
    else layersSheet.open();
    layersBtn.classList.toggle("open", layersSheet.isOpen);
  };
  layersSheet.onClose = () => layersBtn.classList.remove("open");
  nav.appendChild(layersBtn);
  document.body.appendChild(nav);

  const syncView = (v) => {
    nav.querySelectorAll("button[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
    layersBtn.hidden = !(v === "3d" || v === "2d" || v === "orrery");
  };
  state.subscribe("view", syncView);
  syncView(state.get("view"));

  // --- status summary (place · local time) ----------------------------------
  const placeEl = strip.querySelector(".m-place");
  const timeEl = strip.querySelector(".m-time");
  const fmtTime = () => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: state.get("timeFormat") === "12h",
        timeZone: state.get("tz"),
      }).format(state.simTime());
    } catch { return ""; }
  };
  function syncSummary() {
    const city = document.getElementById("cb-city");
    const label = (city && city.value.trim())
      || `${state.get("lat").toFixed(2)}°, ${state.get("lon").toFixed(2)}°`;
    placeEl.textContent = `📍 ${label}`;
    const rate = state.get("timeFlowRate");
    timeEl.textContent = `🕒 ${fmtTime()}${rate === 1 ? "" : rate === 0 ? " ⏸" : " ⏩"}`;
  }
  for (const k of ["lat", "lon", "tz", "timeFormat", "timeFlowRate"]) state.subscribe(k, syncSummary);
  setInterval(syncSummary, 1000);
  syncSummary();

  return true;
}
