// infopanel.js -- slide-in object info card + search box (Phase 8).
//
// Views return a normalized descriptor from pickAt(); this module renders it. Fields that
// are absent are simply skipped, so the same card serves stars, planets, Messier objects
// and orrery bodies.

import * as state from "./state.js";
import * as i18n from "./i18n.js";

function raHMS(raDeg) {
  const h = ((raDeg % 360) + 360) % 360 / 15;
  const hh = Math.floor(h), m = (h - hh) * 60, mm = Math.floor(m);
  const ss = Math.round((m - mm) * 60);
  return `${hh}h ${String(mm).padStart(2, "0")}m ${String(ss).padStart(2, "0")}s`;
}
function decDMS(decDeg) {
  const sign = decDeg < 0 ? "−" : "+";
  const a = Math.abs(decDeg), d = Math.floor(a), m = Math.round((a - d) * 60);
  return `${sign}${d}° ${String(m).padStart(2, "0")}′`;
}
const f1 = (x) => (x == null ? null : x.toFixed(1));

// Build the card rows from a descriptor (Section 8 item 3). Hindu name (graha for the
// Sun/Moon/planets, nakshatra for the principal star) is shown localized to the chosen language.
function rows(d) {
  const r = [];
  if (d.type) r.push(["Type", d.type]);
  // Always show the Hindu name alongside the English IAU title (regardless of how it was
  // searched): the transliteration, plus the localized script when a language is selected.
  const tok = i18n.hinduToken(d.name);
  if (tok) {
    const loc = i18n.tr(tok);
    const label = i18n.GRAHA[d.name] ? "Graha" : i18n.NAKSHATRA_STAR[d.name] ? "Nakshatra" : "Hindu name";
    r.push([label, loc && loc !== tok ? `${tok} (${loc})` : tok]);
  }
  if (d.mag != null) r.push(["Magnitude", d.mag.toFixed(2)]);
  if (d.raDeg != null) r.push(["RA / Dec", `${raHMS(d.raDeg)}  ${decDMS(d.decDeg)}`]);
  if (d.alt != null) {
    // Show both altitudes when near the horizon and they differ meaningfully (Phase 7C).
    if (d.altTrue != null && d.alt < 10 && Math.abs(d.alt - d.altTrue) > 0.02) {
      r.push(["Altitude", `${f1(d.alt)}° (apparent) / ${f1(d.altTrue)}° (geometric)`]);
    } else {
      r.push(["Altitude", `${f1(d.alt)}°`]);
    }
    r.push(["Azimuth", `${f1(d.az)}°`]);
  }
  if (d.distanceAu != null) r.push(["Distance", `${d.distanceAu.toFixed(4)} AU`]);
  if (d.helioAu != null) r.push(["From Sun", `${d.helioAu.toFixed(3)} AU`]);
  if (d.phasePercent != null) r.push(["Illumination", `${f1(d.phasePercent)} %`]);
  if (d.rashi) r.push(["Rashi", d.rashi]);
  if (d.periodDays != null) {
    const y = d.periodDays / 365.25;
    r.push(["Orbital period", y >= 1 ? `${y.toFixed(2)} yr` : `${d.periodDays.toFixed(1)} d`]);
  }
  return r;
}

let panel = null, body = null, titleEl = null, searchInput = null;

export function initInfoPanel(onSelectName, onClose) {
  panel = document.createElement("div");
  panel.className = "infopanel";
  panel.hidden = true;
  panel.innerHTML = `<button class="ip-close" aria-label="close">×</button>
    <div class="ip-title"></div><div class="ip-body"></div>`;
  document.body.appendChild(panel);
  titleEl = panel.querySelector(".ip-title");
  body = panel.querySelector(".ip-body");
  panel.querySelector(".ip-close").addEventListener("click", () => { hideInfo(); if (onClose) onClose(); });

  // Search box (datalist of named objects). Enter / pick -> onSelectName.
  const wrap = document.createElement("div");
  wrap.className = "search-box";
  wrap.innerHTML = `<input id="obj-search" list="obj-list" placeholder="search object…" autocomplete="off" />
    <datalist id="obj-list"></datalist>`;
  document.body.appendChild(wrap);
  searchInput = wrap.querySelector("#obj-search");
  const go = () => { const v = searchInput.value.trim(); if (v) onSelectName(v); };
  searchInput.addEventListener("change", go);
  searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });

  // Object search only makes sense in the sky/orrery views -- hide it for Panchang/Kundali.
  const applyView = (v) => { wrap.hidden = (v === "panchang" || v === "kundali"); };
  state.subscribe("view", applyView);
  applyView(state.get("view"));
}

// Populate the search datalist with object names.
export function setSearchNames(names) {
  const dl = document.getElementById("obj-list");
  if (dl) dl.innerHTML = names.map((n) => `<option value="${n}"></option>`).join("");
}

export function showInfo(d) {
  if (!d) return;
  titleEl.textContent = d.name || `HIP ${d.hip}`;
  body.innerHTML = rows(d).map(([k, v]) =>
    `<div class="ip-row"><span class="ip-k">${k}</span><span class="ip-v">${v}</span></div>`).join("");
  panel.hidden = false;
}

export function hideInfo() {
  if (panel) panel.hidden = true;
}
