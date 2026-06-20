// kundali.js -- South-Indian Kundali tab (Phase 9B.2): fixed-grid SVG charts. Birth inputs
// come from the shared control bar (uniform across views); this module only casts + renders.

import * as api from "./api.js";
import * as i18n from "./i18n.js";

const RASHI = ["Mesha", "Vrishabha", "Mithuna", "Karka", "Simha", "Kanya",
  "Tula", "Vrischika", "Dhanu", "Makara", "Kumbha", "Meena"];

// South-Indian fixed grid: rashi index -> [row, col] in a 4x4 grid (Section 9B.2). Mesha is
// fixed at row0/col1 and the zodiac runs clockwise; the centre 2x2 holds the chart title.
const CELL = {
  11: [0, 0], 0: [0, 1], 1: [0, 2], 2: [0, 3],
  10: [1, 0], 3: [1, 3],
  9: [2, 0], 4: [2, 3],
  8: [3, 0], 7: [3, 1], 6: [3, 2], 5: [3, 3],
};

const STORE_KEY = "kundali.birth";

// Render the Phase 9C interpretation accordion (6 pillars). All text is generated server-side
// from classical signification tables; this only lays it out.
function interpHtml(I) {
  if (!I) return "";
  const t = I.temperament, m = I.mind;
  const chips = I.dignities.chips.length
    ? I.dignities.chips.map((c) => `<span class="kj-chip">${c}</span>`).join("")
    : `<span class="kj-muted">no special dignities (all neutral)</span>`;
  const digRows = I.dignities.rows.map((r) =>
    `<tr><td>${r.graha}</td><td>${r.rashi}</td><td>${r.notes}</td></tr>`).join("");
  const bhavaRows = I.bhavas.rows.map((r) =>
    `<tr><td>${r.bhava}</td><td>${r.name}</td><td>${r.rashi}</td><td>${r.occupants.join(", ") || "—"}</td><td>${r.lord} → ${r.lord_rashi}</td></tr>`).join("");
  const bhavaSent = I.bhavas.rows.filter((r) => r.sentence).map((r) => `<li>${r.sentence}</li>`).join("");
  const goRows = I.timing.gochara_rows.map((r) =>
    `<tr><td>${r.graha}</td><td>${r.transit_rashi}</td><td>${r.house_from_moon}</td></tr>`).join("");
  const headlines = I.timing.headlines.map((h) =>
    `<div class="kj-headline ${h.active ? "on" : ""}"><b>${h.name}:</b> ${h.text}</div>`).join("");
  const flagged = I.upayas.flagged.length
    ? I.upayas.flagged.map((u) => `<li>${u.text} <span class="kj-muted">(${u.reasons.join(", ")})</span></li>`).join("")
    : `<li class="kj-muted">No grahas flagged for remedial reference in this chart.</li>`;
  const allUp = I.upayas.all.map((u) =>
    `<tr><td>${u.graha}</td><td>${u.gemstone}</td><td>${u.vara}</td><td>${u.deity}</td></tr>`).join("");
  return `
    <div class="kj-interp">
      <div class="kj-disclaimer">${I.disclaimer}</div>
      <details open class="kj-acc"><summary>Core temperament — Lagna</summary>
        <p>${t.text}</p>
        <div class="kj-meta">${t.element} · ${t.modality} · lord ${t.lord} in ${t.lord_rashi}</div></details>
      <details class="kj-acc"><summary>Mind &amp; emotion — Moon</summary>
        <p>${m.text}</p>
        <div class="kj-meta">${m.nakshatra} pada ${m.pada} · deity ${m.deity} · symbol ${m.symbol} · ${m.gana} gana</div></details>
      <details class="kj-acc"><summary>Strengths &amp; weaknesses — graha dignity</summary>
        <div class="kj-chips">${chips}</div>
        <table class="kj-tbl"><tr><th>Graha</th><th>Rashi</th><th>Dignity</th></tr>${digRows}</table>
        <div class="kj-muted">${I.dignities.note}</div></details>
      <details class="kj-acc"><summary>The 12 life domains — Bhavas (whole-sign)</summary>
        <table class="kj-tbl"><tr><th>#</th><th>Bhava</th><th>Rashi</th><th>Occupants</th><th>Lord</th></tr>${bhavaRows}</table>
        <ul class="kj-list">${bhavaSent}</ul></details>
      <details class="kj-acc"><summary>Timing — Dashas &amp; transits (Gochara)</summary>
        <p>${I.timing.dasha_paragraph}</p>
        ${headlines}
        <table class="kj-tbl"><tr><th>Graha</th><th>Transit rashi</th><th>House from Moon</th></tr>${goRows}</table></details>
      <details class="kj-acc"><summary>Remedial measures — Upayas (reference)</summary>
        <div class="kj-muted">${I.upayas.disclaimer}</div>
        <ul class="kj-list">${flagged}</ul>
        <details class="kj-acc2"><summary>show all grahas</summary>
          <table class="kj-tbl"><tr><th>Graha</th><th>Gemstone</th><th>Vara</th><th>Deity</th></tr>${allUp}</table></details>
      </details>
    </div>`;
}

function svgChart(title, chart, lagnaRashi, lookup) {
  const S = 72, pad = 2, W = S * 4;
  let cells = "";
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (r >= 1 && r <= 2 && c >= 1 && c <= 2) continue;     // centre block
      const ri = Object.keys(CELL).find((k) => CELL[k][0] === r && CELL[k][1] === c);
      const x = c * S, y = r * S, isLagna = +ri === lagnaRashi;
      const occ = (chart[ri] || []);
      const labels = occ.map((lab, i) => {
        const info = lookup[lab] || { name: lab, retro: false };
        const lx = x + 6 + (i % 3) * 22, ly = y + 26 + Math.floor(i / 3) * 16;
        return `<text x="${lx}" y="${ly}" class="kc-graha"><title>${info.name}${info.retro ? " (retrograde)" : ""}</title>${lab}${info.retro ? "℞" : ""}</text>`;
      }).join("");
      cells += `<g>
        <rect x="${x + pad}" y="${y + pad}" width="${S - 2 * pad}" height="${S - 2 * pad}"
              class="kc-cell ${isLagna ? "kc-lagna" : ""}"/>
        ${isLagna ? `<line x1="${x + pad}" y1="${y + pad}" x2="${x + 16}" y2="${y + pad}"/><line x1="${x + pad}" y1="${y + pad}" x2="${x + pad}" y2="${y + 16}"/>` : ""}
        <text x="${x + 5}" y="${y + 12}" class="kc-sign">${i18n.tr(RASHI[ri])}</text>
        ${labels}</g>`;
    }
  }
  return `<svg viewBox="0 0 ${W} ${W}" class="kc-svg">
    <rect x="${S + pad}" y="${S + pad}" width="${2 * S - 2 * pad}" height="${2 * S - 2 * pad}" class="kc-centre"/>
    <text x="${W / 2}" y="${W / 2}" class="kc-title">${title}</text>
    ${cells}</svg>`;
}

export function createKundali(container) {
  container.innerHTML = `<div class="kj-pane"><div class="kj-result"></div></div>`;
  const result = container.querySelector(".kj-result");

  // Restore the last cast so re-entering the view (or reload) shows the prior chart.
  function getSaved() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; }
  }

  function prompt() {
    result.innerHTML = `<div class="kj-prompt">Enter the <b>birth place, date and time</b> in the bar above, then it casts automatically. Use the City search or Lat/Lon; times are 24-hour in the birth location's zone.</div>`;
  }

  // Cast from explicit birth params: {date, time(HH:MM), lat, lon, tz, node, ayanamsa}.
  async function cast(p) {
    if (!p || !p.date) { prompt(); return; }
    localStorage.setItem(STORE_KEY, JSON.stringify(p));
    result.innerHTML = `<div class="kj-loading">casting…</div>`;
    try {
      const k = await api.fetchKundali({
        dt: `${p.date}T${p.time || "00:00"}`, lat: +p.lat, lon: +p.lon,
        tz: p.tz || "auto", node: p.node, ayanamsa: p.ayanamsa,
      });
      render(k);
    } catch (err) {
      result.innerHTML = `<div class="kj-loading">could not cast chart: ${err.message}</div>`;
    }
  }

  function render(k) {
    const lookup = { La: { name: "Lagna (ascendant)", retro: false } };
    for (const g of k.grahas) lookup[g.label] = { name: g.name, retro: g.retrograde };
    const bp = k.birth_panchang;
    const cur = k.current_dasha;
    result.innerHTML = `
      <div class="kj-charts">
        <div>${svgChart("Rasi", k.rasi_chart, k.lagna.rashi, lookup)}</div>
        <div>${svgChart("Navamsa", k.navamsa_chart, k.lagna.navamsa_rashi, lookup)}</div>
      </div>
      <div class="pj-card kj-card">
        <div class="pj-card-t">Birth panchang</div>
        <div class="kj-bp">
          <span>Janma nakshatra: <b>${i18n.tr(bp.janma_nakshatra)}</b> pada ${bp.pada}</span>
          <span>Chandra rashi: <b>${i18n.tr(bp.chandra_rashi)}</b></span>
          <span>Surya rashi: <b>${i18n.tr(bp.surya_rashi)}</b></span>
          <span>Tithi: <b>${i18n.tr(bp.tithi)}</b></span>
          <span>Vara: <b>${i18n.tr(bp.vara)}</b></span>
          <span>Yoga: <b>${i18n.tr(bp.yoga)}</b> · Karana: <b>${i18n.tr(bp.karana)}</b></span>
        </div>
      </div>
      <div class="pj-card kj-card">
        <div class="pj-card-t">Vimshottari dasha — janma lord ${k.dasha_summary.janma_lord} (balance ${k.dasha_summary.balance_years} yr)</div>
        ${cur.maha ? `<div class="kj-curdasha">Current: <b>${cur.maha}</b> maha / <b>${cur.antar || "—"}</b> antar · maha ends ${cur.maha_ends}</div>` : `<div class="kj-curdasha">(dasha cycle of 120 yr has completed)</div>`}
        <details><summary>full maha-dasha timeline</summary>
          <table class="kj-dasha">${k.dashas.map((d) => `<tr class="${d.lord === (cur.maha || "") ? "cur" : ""}"><td>${d.lord}</td><td>${d.start}</td><td>${d.end}</td></tr>`).join("")}</table>
        </details>
      </div>
      ${interpHtml(k.interpretation)}
      <div class="kj-foot">${k.ayanamsa} ayanamsa · ${k.node} node · computed, not a substitute for a qualified astrologer's reading. Historical births use the location's historically-correct timezone offset.</div>`;
  }

  return { cast, prompt, getSaved };
}
