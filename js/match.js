// match.js -- Kundali Milan (Section C.5): classical 36-guna matching between two birth
// charts. Self-contained: its own two-person birth mini-forms (city/date/time), independent
// of the shared control bar (which only has room for one birth).

import * as api from "./api.js";
import * as i18n from "./i18n.js";
import * as state from "./state.js";
import { setupCityAutocomplete, normTime, wireTimeBox } from "./ui.js";
import { attachDateBoxes } from "./datefield.js";

const STORE_KEY = "match.persons";

function personFieldsHtml(id, title) {
  return `
    <fieldset class="mj-person">
      <legend>${title}</legend>
      <label>City<input type="text" id="mj-${id}-city" placeholder="search city…"></label>
      <label>Lat<input type="number" id="mj-${id}-lat" step="0.0001"></label>
      <label>Lon<input type="number" id="mj-${id}-lon" step="0.0001"></label>
      <label>Date<input type="date" id="mj-${id}-date"></label>
      <label>Time (24h)<input type="text" id="mj-${id}-time" placeholder="HH:MM" maxlength="5" inputmode="numeric"></label>
    </fieldset>`;
}

function getSaved() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; }
}

export function createMatch(container) {
  container.innerHTML = `
    <div class="mj-pane">
      <div class="mj-form">
        ${personFieldsHtml("a", "Person A (vara)")}
        ${personFieldsHtml("b", "Person B (kanya)")}
      </div>
      <button id="mj-go" type="button" class="mj-go">Match</button>
      <div class="mj-result"></div>
    </div>`;
  const $ = (s) => container.querySelector(s);
  const result = $(".mj-result");

  const fields = {};
  for (const id of ["a", "b"]) {
    fields[id] = {
      city: $(`#mj-${id}-city`), lat: $(`#mj-${id}-lat`), lon: $(`#mj-${id}-lon`),
      date: $(`#mj-${id}-date`), time: $(`#mj-${id}-time`),
    };
    setupCityAutocomplete(fields[id].city, (c) => {
      fields[id].lat.value = c.lat.toFixed(4); fields[id].lon.value = c.lon.toFixed(4);
      persist();
    });
    wireTimeBox(fields[id].time);
    fields[id].dateBoxes = attachDateBoxes(fields[id].date);   // typed Y / M / D, as in the control bar
    for (const el of [fields[id].city, fields[id].lat, fields[id].lon, fields[id].date, fields[id].time]) el.addEventListener("change", persist);
  }

  function personValue(id) {
    const f = fields[id];
    return {
      city: f.city.value, lat: f.lat.value, lon: f.lon.value,
      date: f.date.value, time: f.time.value,
    };
  }
  function persist() {
    localStorage.setItem(STORE_KEY, JSON.stringify({ a: personValue("a"), b: personValue("b") }));
  }
  function restore() {
    const saved = getSaved();
    if (!saved) return;
    for (const id of ["a", "b"]) {
      const p = saved[id]; if (!p) continue;
      fields[id].city.value = p.city || ""; fields[id].lat.value = p.lat || "";
      fields[id].lon.value = p.lon || ""; fields[id].date.value = p.date || "";
      fields[id].time.value = p.time || "";
      fields[id].dateBoxes.sync();
    }
  }
  restore();

  function personPayload(id) {
    const f = fields[id];
    if (!f.date.value || !f.lat.value || !f.lon.value) return null;
    return {
      dt: `${f.date.value}T${normTime(f.time.value)}`,
      lat: +f.lat.value, lon: +f.lon.value, tz: "auto",
    };
  }

  async function go() {
    persist();
    const a = personPayload("a"), b = personPayload("b");
    if (!a || !b) {
      result.innerHTML = `<div class="kj-loading">Enter both people's birth place and date to match.</div>`;
      return;
    }
    result.innerHTML = `<div class="kj-loading">matching…</div>`;
    try {
      const m = await api.fetchMatch({ a, b, node: state.get("node"), ayanamsa: state.get("ayanamsa") });
      render(m);
    } catch (err) {
      result.innerHTML = `<div class="kj-loading">could not cast match: ${err.message}</div>`;
    }
  }
  $("#mj-go").onclick = go;

  function render(m) {
    const kootaRows = m.kootas.map((k) => `
      <tr>
        <td>${i18n.tr(k.key[0].toUpperCase() + k.key.slice(1))}</td>
        <td>${i18n.tr(String(k.a))}</td>
        <td>${i18n.tr(String(k.b))}</td>
        <td>${k.points} / ${k.max}</td>
        <td class="kj-muted">${k.note}</td>
      </tr>`).join("");
    const doshaNotes = m.doshas.notes.map((n) => `<div class="kj-headline on"><b>Dosha:</b> ${n}</div>`).join("");
    const mangalRow = (label, p) => `
      <div class="pj-guide-row">${label}: from lagna house ${p.from_lagna}, from Moon house ${p.from_moon}
        — <b>${p.indicated ? "indicated" : "not indicated"}</b></div>`;
    result.innerHTML = `
      <div class="pj-card kj-card">
        <div class="pj-card-t">Ashtakoota score</div>
        <div class="kj-curdasha">${m.total.points} / ${m.total.max} — <b>${m.total.text}</b></div>
      </div>
      <div class="pj-card kj-card">
        <div class="pj-card-t">8 kootas</div>
        <table class="kj-tbl"><tr><th>Koota</th><th>Person A</th><th>Person B</th><th>Points</th><th>Theme</th></tr>${kootaRows}</table>
        ${doshaNotes}
      </div>
      <div class="pj-card kj-card">
        <div class="pj-card-t">Mangal (kuja) dosha</div>
        ${mangalRow("Person A", m.mangal.a)}
        ${mangalRow("Person B", m.mangal.b)}
        <div class="kj-muted">${m.mangal.note}</div>
      </div>
      <div class="kj-foot">${m.convention}</div>
      <div class="kj-foot">${m.disclaimer}</div>`;
  }

  return { go, getSaved };
}
