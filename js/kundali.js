// kundali.js -- South-Indian Kundali tab (Phase 9B.2): fixed-grid SVG charts + PDF-style
// summary report. Birth inputs come from the shared control bar (uniform across views); this
// module only casts + renders.

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
const NAME_KEY = "kundali.name";

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
  function getSavedName() {
    try { return localStorage.getItem(NAME_KEY) || ""; } catch { return ""; }
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
      k._birth = p;   // stash birth params for the PDF header
      render(k);
    } catch (err) {
      result.innerHTML = `<div class="kj-loading">could not cast chart: ${err.message}</div>`;
    }
  }

  function reportHeaderHtml(k) {
    const b = k._birth || {};
    const name = getSavedName() || "Khagol - Hindu Panchang & Sky Map Chart";
    return `
      <div class="kj-report-head">
        <div class="kj-rh-title">${name}</div>
        <div class="kj-rh-meta">
          <span>${b.date || ""} ${b.time || ""}</span>
          <span>Lat ${k.location?.lat ?? b.lat}, Long ${k.location?.lon ?? b.lon}</span>
          <span>${k.ayanamsa || ""} ayanamsa · ${k.node || ""} node</span>
        </div>
      </div>`;
  }

  function planetTableHtml(s) {
    const rows = s.rows.map((r) => `
      <tr>
        <td>${i18n.tr(r.name)}${r.retrograde ? " (R)" : ""}</td>
        <td>${i18n.tr(r.rashi_name)}</td>
        <td class="kj-num">${r.house}</td>
        <td class="kj-num">${r.deg_dms}</td>
        <td>${i18n.tr(r.nakshatra)}-${r.pada}, ${i18n.tr(r.nakshatra_lord)}</td>
      </tr>`).join("");
    return `
      <div class="kj-report">
        <div class="kj-card-t kj-section-title">Planets</div>
        <table class="kj-report-tbl">
          <thead><tr><th>Planet</th><th>Zodiac</th><th>House</th><th>Degree</th><th>Nakshatra</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function dashaTableHtml(k) {
    const s = k.summary;
    const cur = k.current_dasha;
    const dashaRows = k.dashas.map((d) => `
      <tr class="${d.lord === (k.current_dasha.maha || "") ? "cur" : ""}">
        <td>${d.lord}</td><td>${d.start}</td><td>${d.end}</td>
      </tr>`).join("");
    return `
      <div class="kj-report">
        <div class="kj-card-t kj-section-title">Vimshottari dasha</div>
        <div class="kj-report-subtitle">
          <div><span class="kj-rh-label">Janma Lord</span><span class="kj-rh-val">${k.dasha_summary.janma_lord}</span></div>
          <div><span class="kj-rh-label">Balance</span><span class="kj-rh-val">${k.dasha_summary.balance_years} YR</span></div>
          ${cur.maha ? `<div class="kj-curdasha-line"><span class="kj-rh-label">Current</span><span class="kj-rh-val">${cur.maha} maha / ${cur.antar || "—"} antar · ends ${cur.maha_ends}</span></div>` : ""}
        </div>
        <table class="kj-report-dasha-tbl">
          <thead><tr><th>Lord</th><th>Start</th><th>End</th></tr></thead>
          <tbody>${dashaRows}</tbody>
        </table>
        <div class="kj-report-foot">${k.ayanamsa} ayanamsa · ${s.ayanamsa_dms} · computed report, not a substitute for a qualified astrologer.</div>
      </div>`;
  }

  function reportIntroHtml(k) {
    if (!k.summary) return "";
    const s = k.summary;
    const bp = k.birth_panchang;
    return `
      <div class="kj-report kj-report-intro">
        ${reportHeaderHtml(k)}
        <div class="kj-report-hero">
          <div><span class="kj-rh-label">Tithi</span><span class="kj-rh-val">${i18n.tr(s.tithi)}</span></div>
          <div><span class="kj-rh-label">Karana</span><span class="kj-rh-val">${i18n.tr(s.karana)}</span></div>
          <div><span class="kj-rh-label">Yoga</span><span class="kj-rh-val">${i18n.tr(s.yoga)}</span></div>
        </div>
        <div class="kj-report-bp">
          <div><span class="kj-rh-label">Vara</span><span class="kj-rh-val">${i18n.tr(bp.vara)}</span></div>
          <div><span class="kj-rh-label">Chandra Rashi</span><span class="kj-rh-val">${i18n.tr(bp.chandra_rashi)}</span></div>
          <div><span class="kj-rh-label">Surya Rashi</span><span class="kj-rh-val">${i18n.tr(bp.surya_rashi)}</span></div>
          <div><span class="kj-rh-label">Janma Nakshatra</span><span class="kj-rh-val">${i18n.tr(bp.janma_nakshatra)} pada ${bp.pada}</span></div>
        </div>
      </div>`;
  }

  function summaryHtml(k) {
    if (!k.summary) return "";
    return planetTableHtml(k.summary) + dashaTableHtml(k);
  }

  function dashaHtml(k) { return ""; }

  function render(k) {
    const lookup = { La: { name: "Lagna (ascendant)", retro: false } };
    for (const g of k.grahas) lookup[g.label] = { name: g.name, retro: g.retrograde };
    const charts = `
      <div>${svgChart("Rasi", k.rasi_chart, k.lagna.rashi, lookup)}</div>
      <div>${svgChart("Navamsa", k.navamsa_chart, k.lagna.navamsa_rashi, lookup)}</div>`;
    result.innerHTML = `
      <div class="kj-toolbar">
        <label class="kj-name-lbl">Name<input type="text" id="kj-name" class="kj-name" placeholder="optional" value="${getSavedName().replace(/"/g, "&quot;")}"></label>
        <button class="kj-pdf-btn" type="button" title="Save this summary as PDF">📄 Export PDF</button>
      </div>
      ${reportIntroHtml(k)}
      <div class="kj-charts">${charts}</div>
      ${summaryHtml(k)}
      ${dashaHtml(k)}
      ${interpHtml(k.interpretation)}
      <div class="kj-foot">${k.ayanamsa} ayanamsa · ${k.node} node · computed, not a substitute for a qualified astrologer's reading. Historical births use the location's historically-correct timezone offset.</div>`;

    const pdfBtn = result.querySelector(".kj-pdf-btn");
    if (pdfBtn) pdfBtn.addEventListener("click", () => {
      const nameInput = result.querySelector("#kj-name");
      if (nameInput) {
        try { localStorage.setItem(NAME_KEY, nameInput.value.trim()); } catch { /* ignore */ }
      }
      document.body.classList.add("kj-printing-report");
      setTimeout(() => { window.print(); document.body.classList.remove("kj-printing-report"); }, 50);
    });
    const nameInput = result.querySelector("#kj-name");
    if (nameInput) nameInput.addEventListener("change", () => {
      try { localStorage.setItem(NAME_KEY, nameInput.value.trim()); } catch { /* ignore */ }
    });
  }

  return { cast, prompt, getSaved };
}
