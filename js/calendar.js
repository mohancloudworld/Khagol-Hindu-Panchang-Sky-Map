// calendar.js -- month-grid Panchang view (Section 9 item 7).

import { matchDay } from "../src/savedevents.js";
import * as i18n from "./i18n.js";

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// `today` (optional) returns {y, m} for the Today button; defaults to the device's month.
export function createCalendar(container, { fetchMonth, onPickDay, today }) {
  let year = 2026, month = 6;
  let savedEvents = [];
  container.innerHTML = `
    <div class="cal-nav">
      <button class="cal-prev-y" aria-label="previous year" title="previous year">«</button>
      <button class="cal-prev" aria-label="previous month" title="previous month">◀</button>
      <select class="cal-month" aria-label="month">${MONTHS.map((n, i) => `<option value="${i + 1}">${n}</option>`).join("")}</select>
      <input class="cal-year" type="text" inputmode="numeric" maxlength="4" aria-label="year" title="type a year">
      <button class="cal-next" aria-label="next month" title="next month">▶</button>
      <button class="cal-next-y" aria-label="next year" title="next year">»</button>
      <button class="cal-today" title="this month">Today</button>
    </div>
    <div class="cal-grid"></div>`;
  const monthEl = container.querySelector(".cal-month");
  const yearEl = container.querySelector(".cal-year");
  const gridEl = container.querySelector(".cal-grid");
  // Any month in one gesture: pick it from the list and type the year. The arrows page a
  // month (◀ ▶) or a whole year (« ») -- reaching 20 years back is 20 taps, not 240.
  const YEAR_MIN = 1600, YEAR_MAX = 2600;
  container.querySelector(".cal-prev").onclick = () => { if (--month < 1) { month = 12; year--; } render(); };
  container.querySelector(".cal-next").onclick = () => { if (++month > 12) { month = 1; year++; } render(); };
  container.querySelector(".cal-prev-y").onclick = () => { year--; render(); };
  container.querySelector(".cal-next-y").onclick = () => { year++; render(); };
  container.querySelector(".cal-today").onclick = () => {
    const t = today ? today() : { y: new Date().getFullYear(), m: new Date().getMonth() + 1 };
    year = t.y; month = t.m; render();
  };
  monthEl.onchange = () => { month = +monthEl.value; render(); };
  yearEl.addEventListener("input", () => { yearEl.value = yearEl.value.replace(/\D/g, ""); });
  yearEl.onchange = () => {
    const y = +yearEl.value;
    const ok = y >= YEAR_MIN && y <= YEAR_MAX;
    yearEl.classList.toggle("df-bad", !ok);
    yearEl.title = ok ? "type a year" : `year must be ${YEAR_MIN}–${YEAR_MAX}`;
    if (ok) { year = y; render(); }
  };
  yearEl.addEventListener("keydown", (e) => { if (e.key === "Enter") yearEl.blur(); });

  async function render() {
    year = Math.min(YEAR_MAX, Math.max(YEAR_MIN, year));
    monthEl.value = String(month);
    if (document.activeElement !== yearEl) yearEl.value = String(year);
    gridEl.innerHTML = `<div class="cal-loading">loading…</div>`;
    let days;
    try { days = await fetchMonth(year, month); }
    catch { gridEl.innerHTML = `<div class="cal-loading">month unavailable</div>`; return; }

    const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();   // 0 = Sunday
    let html = WEEK.map((w) => `<div class="cal-h">${w}</div>`).join("");
    for (let i = 0; i < firstDow; i++) html += `<div class="cal-cell empty"></div>`;
    for (const d of days) {
      const dom = parseInt(d.date.slice(8, 10), 10);
      const cls = d.is_amavasya ? "amavasya" : d.is_purnima ? "purnima" : d.is_ekadashi ? "ekadashi" : "";
      const fests = d.festivals.map((f) => `<span class="cal-fest">${f.name}</span>`).join("")
        // Grahana marks the day too: ☉ for Surya, ☾ for Chandra, dimmed where it is not visible.
        + (d.grahana || []).map((g) => `<span class="cal-grahana${g.visible_here === false ? " unseen" : ""}" ` +
            `title="${g.grahana} · ${g.type}${g.visible_here === false ? " · not visible here" : ""}">` +
            `${g.kind === "solar" ? "☉" : "☾"} ${i18n.tr(g.type)}</span>`).join("");
      // Saved-event recurrences (tithi+masa) -- distinct from festivals.
      const saved = matchDay(d.masa, d.tithi_n, savedEvents)
        .map((e) => `<span class="cal-saved" title="saved event">★ ${e.label}</span>`).join("");
      html += `<div class="cal-cell ${cls}${saved ? " has-saved" : ""}" data-date="${d.date}">
        <div class="cal-dom">${dom}</div>
        <div class="cal-tithi">${d.tithi_at_sunrise}</div>
        <div class="cal-nak">${d.nakshatra_at_sunrise}</div>
        ${fests}${saved}</div>`;
    }
    gridEl.innerHTML = html;
    gridEl.querySelectorAll(".cal-cell[data-date]").forEach((c) =>
      { c.onclick = () => onPickDay(c.dataset.date); });
  }

  return {
    show(y, m) { year = y; month = m; render(); },
    setSavedEvents(arr) { savedEvents = arr || []; if (container.querySelector(".cal-grid")) render(); },
  };
}
