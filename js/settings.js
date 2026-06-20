// settings.js -- gear-icon settings panel (Phase 9D.1). Persists user preferences in
// localStorage and writes them into the observable state; a small hooks object lets main.js
// react (refetch with the new ayanamsa, recast the Kundali, relabel for a new language...).

import * as state from "./state.js";

const KEY = "settings";
// Persisted fields and their defaults (the single source of truth for "reset to defaults").
const DEFAULTS = {
  ayanamsa: "lahiri", node: "mean", nameMode: "hindu", language: "en",
  telescopic: true, atmosphere: true, orreryScale: "linear",
};
const FIELDS = Object.keys(DEFAULTS);

// Apply saved settings (merged over defaults) into state. Call BEFORE the first data fetch.
export function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { /* ignore */ }
  for (const f of FIELDS) state.set(f, f in saved ? saved[f] : DEFAULTS[f]);
}

function persist() {
  const out = {};
  for (const f of FIELDS) out[f] = state.get(f);
  try { localStorage.setItem(KEY, JSON.stringify(out)); } catch { /* ignore */ }
}

// Build the gear button + slide-in panel. `hooks.onChange(field)` fires after each change.
export function createSettingsPanel(hooks = {}) {
  const btn = document.createElement("button");
  btn.className = "settings-gear"; btn.title = "settings"; btn.setAttribute("aria-label", "settings");
  btn.textContent = "⚙";
  const panel = document.createElement("div");
  panel.className = "settings-panel"; panel.hidden = true;
  panel.innerHTML = `
    <div class="set-hd">Settings</div>
    <div class="set-actions">
      <button class="set-act" data-act="export">📷 Save view as PNG</button>
      <button class="set-act" data-act="print">🖨 Print Kundali / PDF</button>
    </div>
    <label>Ayanamsa<select data-k="ayanamsa">
      <option value="lahiri">Lahiri</option><option value="raman">Raman</option><option value="kp">KP</option></select></label>
    <label>Language Mode<select data-k="nameMode">
      <option value="english">English</option><option value="hindu">Hindu</option></select></label>
    <label class="set-lang">Language<select data-k="language">
      <option value="en">English</option></select></label>
    <label class="set-row"><input type="checkbox" data-k="telescopic"> Show Uranus &amp; Neptune</label>
    <label class="set-row"><input type="checkbox" data-k="atmosphere"> Atmosphere on by default</label>
    <label>Orrery scale<select data-k="orreryScale">
      <option value="linear">Linear</option><option value="log">Log</option></select></label>
    <button class="set-reset">Reset to defaults</button>
    <div class="set-note">Ayanamsa is always shown in the footer; it shifts nakshatra / rashi boundaries.</div>`;
  document.body.append(btn, panel);

  const controls = panel.querySelectorAll("[data-k]");
  const langLabel = panel.querySelector(".set-lang");
  const langSel = panel.querySelector('[data-k="language"]');
  const syncUi = () => {
    for (const el of controls) {
      const v = state.get(el.dataset.k);
      if (el.type === "checkbox") el.checked = !!v; else el.value = v;
    }
    // English mode has no Indian script to choose -> grey the Language picker out.
    const off = state.get("nameMode") === "english";
    langSel.disabled = off;
    langLabel.classList.toggle("set-disabled", off);
  };
  const onInput = (el) => {
    const k = el.dataset.k;
    state.set(k, el.type === "checkbox" ? el.checked : el.value);
    persist();
    if (k === "nameMode") {
      // Leaving Hindu mode: snap Language back to English so the now-greyed picker matches the
      // text on screen (otherwise keywords would stay in the last Indian language).
      if (state.get("nameMode") === "english" && state.get("language") !== "en") {
        state.set("language", "en");
        hooks.onChange && hooks.onChange("language");
      }
      syncUi();                              // refresh the Language value + enabled/greyed state
    }
    hooks.onChange && hooks.onChange(k);
  };
  for (const el of controls) el.addEventListener("change", () => onInput(el));
  panel.querySelector(".set-reset").addEventListener("click", () => {
    for (const f of FIELDS) state.set(f, DEFAULTS[f]);
    persist(); syncUi();
    hooks.onChange && hooks.onChange("*");
  });
  // Context actions: export PNG (sky/orrery views) and print Kundali, enabled per view.
  const actExport = panel.querySelector('[data-act="export"]');
  const actPrint = panel.querySelector('[data-act="print"]');
  actExport.addEventListener("click", () => { if (!actExport.disabled && hooks.onExport) { hooks.onExport(); panel.hidden = true; } });
  actPrint.addEventListener("click", () => { if (!actPrint.disabled && hooks.onPrint) hooks.onPrint(); });
  const applyViewActions = (v) => {
    actExport.disabled = !(v === "3d" || v === "2d" || v === "orrery");
    actPrint.disabled = v !== "kundali";
  };
  state.subscribe("view", applyViewActions);
  applyViewActions(state.get("view"));

  // Persist when a setting is changed OUTSIDE the gear (the Kundali bar mirrors node/ayanamsa/
  // language into state directly) -- so e.g. node, no longer in the gear, still survives reload.
  for (const f of ["node", "ayanamsa", "language", "nameMode"]) state.subscribe(f, persist);

  btn.addEventListener("click", () => { syncUi(); panel.hidden = !panel.hidden; });
  document.addEventListener("click", (e) => {
    if (!panel.hidden && !panel.contains(e.target) && e.target !== btn) panel.hidden = true;
  });
  syncUi();
  return { open: () => { syncUi(); panel.hidden = false; }, syncUi };
}
