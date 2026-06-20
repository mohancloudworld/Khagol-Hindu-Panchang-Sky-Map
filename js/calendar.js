// calendar.js -- month-grid Panchang view (Section 9 item 7).

import { matchDay } from "../src/savedevents.js";

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function createCalendar(container, { fetchMonth, onPickDay }) {
  let year = 2026, month = 6;
  let savedEvents = [];
  container.innerHTML = `
    <div class="cal-nav">
      <button class="cal-prev" aria-label="previous month">◀</button>
      <span class="cal-title"></span>
      <button class="cal-next" aria-label="next month">▶</button>
    </div>
    <div class="cal-grid"></div>`;
  const title = container.querySelector(".cal-title");
  const gridEl = container.querySelector(".cal-grid");
  container.querySelector(".cal-prev").onclick = () => { if (--month < 1) { month = 12; year--; } render(); };
  container.querySelector(".cal-next").onclick = () => { if (++month > 12) { month = 1; year++; } render(); };

  async function render() {
    title.textContent = `${MONTHS[month - 1]} ${year}`;
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
      const fests = d.festivals.map((f) => `<span class="cal-fest">${f.name}</span>`).join("");
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
