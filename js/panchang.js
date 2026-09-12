// panchang.js -- Panchang dashboard tab (Phase 9). Renders the /api/panchang response.
//
// All instants from the backend are local-to-the-observed-location ISO strings; we read the
// clock straight from the string (so the displayed time is the LOCATION's local time, not
// the browser's), while parsing to a Date only for durations/now-comparisons.

import * as state from "./state.js";
import * as i18n from "./i18n.js";
import { matchDay } from "../src/savedevents.js";
import { dayGuidance } from "../src/dayguide.js";

// Always-visible kaal captions (Section 9 item 6b) -- what each window is anchored to.
const KAAL_INFO = {
  rahu: "⅛ of daytime; which eighth depends on weekday",
  yamagandam: "⅛ of daytime; which eighth depends on weekday",
  gulika: "⅛ of daytime; which eighth depends on weekday",
  abhijit: "midday muhurta, centered on solar noon (not 12:00 PM)",
  brahma: "96–48 min before sunrise",
  madhyahna: "middle fifth of daytime",
  aparahna: "fourth fifth of daytime",
  pradosha: "from sunset, ⅕ of the night (≈ 2 h 24 m)",
  nishita: "night's middle muhurta, at solar midnight (not 12:00 AM)",
  chandrodaya: "today's moonrise",
  choghadiya: "day & night in 8 parts, each auspicious or not",
  hora: "planetary hours; first hora ruled by the weekday's lord",
};

function to12(hm) {
  let [h, m] = hm.split(":").map(Number);
  const ap = h < 12 ? "AM" : "PM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
}

// "...T12:49:50+05:30" or "05:42:11" -> "12:49" (location-local clock; 12h/24h per setting).
function clock(s) {
  if (!s) return "—";
  const m = s.match(/T(\d{2}:\d{2})/) || s.match(/^(\d{2}:\d{2})/);
  if (!m) return s;
  return state.get("timeFormat") === "12h" ? to12(m[1]) : m[1];
}
const inst = (s) => (s ? new Date(s).getTime() : null);     // absolute instant (ms)

function countdown(endIso, nowMs) {
  const e = inst(endIso);
  if (e == null) return "";
  let d = Math.round((e - nowMs) / 1000);
  if (d <= 0) return "ended";
  const h = Math.floor(d / 3600); d -= h * 3600;
  const mi = Math.floor(d / 60);
  return h > 0 ? `${h}h ${mi}m` : `${mi}m ${d - mi * 60}s`;
}

// hooks.onShiftDay(ymd): the ◀ ▶ day arrows under the hero ask the app to show that date.
export function createPanchangTab(container, hooks = {}) {
  container.innerHTML = `
    <div class="pj-banner" hidden></div>
    <div class="pj-predawn" hidden></div>
    <div class="pj-hero">
      <div class="pj-hero-main"></div>
      <div class="pj-hero-sub"></div>
      <div class="pj-daynav">
        <button type="button" class="pj-day-prev" title="previous day">◀ prev day</button>
        <button type="button" class="pj-day-next" title="next day">next day ▶</button>
      </div>
    </div>
    <div class="pj-festivals"></div>
    <div class="pj-saved-line"></div>
    <div class="pj-grid"></div>
    <div class="pj-timeline-wrap"><div class="pj-timeline-title">Day timeline (sunrise → next sunrise)</div><div class="pj-timeline"></div></div>
    <div class="pj-foot"></div>`;
  const $ = (s) => container.querySelector(s);
  const banner = $(".pj-banner"), predawn = $(".pj-predawn");
  const heroMain = $(".pj-hero-main"), heroSub = $(".pj-hero-sub");
  const festEl = $(".pj-festivals"), grid = $(".pj-grid");
  const savedEl = $(".pj-saved-line");
  const timeline = $(".pj-timeline"), foot = $(".pj-foot");

  let data = null;
  // Step a civil day either way from the day on show (ISO date arithmetic, zone-free).
  const shift = (delta) => {
    if (!data || !hooks.onShiftDay) return;
    const d = new Date(`${data.date_local}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    hooks.onShiftDay(d.toISOString().slice(0, 10));
  };
  container.querySelector(".pj-day-prev").onclick = () => shift(-1);
  container.querySelector(".pj-day-next").onclick = () => shift(+1);
  let savedEvents = [];

  // --- card helpers --------------------------------------------------------
  function card(title, bigHtml, sub, caption) {
    return `<div class="pj-card"><div class="pj-card-t">${title}</div>
      <div class="pj-card-big">${bigHtml}</div>
      <div class="pj-card-sub">${sub || ""}</div>
      ${caption ? `<div class="pj-cap">${caption}</div>` : ""}</div>`;
  }
  function windowRow(label, w, caption, active) {
    if (!w) return "";
    return `<div class="pj-krow ${active ? "active" : ""}">
      <span class="pj-kname">${label}</span>
      <span class="pj-kwin">${clock(w.start)}–${clock(w.end)}</span>
      <span class="pj-cap">${caption}</span></div>`;
  }
  const within = (w, nowMs) => w && inst(w.start) <= nowMs && nowMs < inst(w.end);

  // --- render --------------------------------------------------------------
  function render(nowMs) {
    const d = data;
    heroMain.textContent = `${i18n.tr(d.vara)} · ${i18n.tr(d.masa.name)} ${i18n.tr(d.paksha)} ${i18n.tr(d.tithi_at_sunrise.name)}`;
    heroSub.innerHTML = `Samvatsara <b>${i18n.tr(d.samvatsara.name)}</b> · ${d.date_local} · ${d.location.tz}`;

    predawn.hidden = !d.solar_day.is_pre_dawn;
    if (d.solar_day.is_pre_dawn) {
      predawn.textContent = `Before sunrise — ${d.solar_day.vara_now}'s solar day is still running; the panchang below is for ${d.date_local} beginning at sunrise ${clock(d.sun.sunrise_local)}.`;
    }

    festEl.innerHTML = d.festivals.map((f) => {
      const win = f.window_local ? ` ${clock(f.window_local.start)}–${clock(f.window_local.end)}` : "";
      return `<span class="pj-badge ${f.disputed ? "disputed" : ""}" title="${f.note || ""}">${f.name}<small> · ${f.kaal}${win}</small></span>`;
    }).join("") || `<span class="pj-none">no festivals today</span>`;

    // Grahana badges sit with the festivals: an eclipse IS the day's event. "visible here"
    // is the part that depends on where you are — the contact times do not.
    festEl.innerHTML += (d.grahana || []).map((g) => {
      // *_local: the same instants written in the viewer's zone (see buildpanchang.js).
      const span = g.kind === "lunar"
        ? `${clock(g.partial_begin_local || g.penumbral_begin_local)}–${clock(g.partial_end_local || g.penumbral_end_local)}`
        : `${clock((g.local && g.local.first_contact_local) || g.begin_local)}–${clock((g.local && g.local.fourth_contact_local) || g.end_local)}`;
      const seen = g.visible_here === false ? " · not visible here" : "";
      // How much of the disc is covered, for THIS location. For a lunar eclipse that is a
      // geocentric fact (the Moon is in Earth's shadow for everyone); for a solar one it is
      // genuinely local, and reads 0% where the shadow misses you.
      const pct = g.obscuration == null ? ""
        : ` · ${g.obscuration >= 0.995 ? 100 : +(g.obscuration * 100).toFixed(g.obscuration < 0.1 ? 1 : 0)}%`;
      const tip = g.kind === "lunar"
        ? `${g.type} lunar eclipse · umbral magnitude ${g.umbral_magnitude.toFixed(3)}`
        : `${g.type} solar eclipse${g.local ? ` · magnitude ${g.local.magnitude.toFixed(3)}` : ""}`;
      return `<span class="pj-badge grahana" title="${tip}">${i18n.tr(g.grahana)}<small> · ${i18n.tr(g.type)}${pct} · ${span}${seen}</small></span>`;
    }).join("");

    // Saved events whose tithi+masa recurs today (kept separate from festivals).
    const hits = matchDay(d.masa.name, d.tithi_at_sunrise.number, savedEvents);
    savedEl.innerHTML = hits.map((e) => `<span class="pj-saved-badge" title="saved event">★ ${e.label}</span>`).join("");
    savedEl.hidden = hits.length === 0;

    const ti = d.tithi_at_sunrise, tn = d.tithi_now;
    const tithiSub = `ends ${clock(ti.ends_at_local)} · <b>${countdown(ti.ends_at_local, nowMs)}</b>` +
      (tn.display !== ti.display ? `<br>now: ${i18n.tr(tn.display)}` : "");
    const nk = d.nakshatra_at_sunrise;

    grid.innerHTML = [
      card(i18n.label("card_tithi", "Tithi (at sunrise)"), i18n.tr(ti.display), tithiSub),
      card(i18n.label("card_nakshatra", "Nakshatra"), `${i18n.tr(nk.name)} <small>pada ${nk.pada}</small>`, `ends ${clock(nk.ends_at_local)} · <b>${countdown(nk.ends_at_local, nowMs)}</b>`),
      card(i18n.label("card_yoga", "Yoga"), i18n.tr(d.yoga.name), `ends ${clock(d.yoga.ends_at_local)}`),
      card(i18n.label("card_karana", "Karana"), i18n.tr(d.karana.name), ""),
      card("Sun", `↑ ${clock(d.sun.sunrise_local)} &nbsp; ↓ ${clock(d.sun.sunset_local)}`, "sunrise · sunset"),
      card("Moon", `↑ ${clock(d.moon.moonrise_local)} &nbsp; ↓ ${clock(d.moon.moonset_local)}`, "moonrise · moonset"),
      `<div class="pj-card pj-card-wide"><div class="pj-card-t">Inauspicious kalams</div>
        ${windowRow("Rahu Kalam", d.kalam.rahu, KAAL_INFO.rahu, within(d.kalam.rahu, nowMs))}
        ${windowRow("Yamagandam", d.kalam.yamagandam, KAAL_INFO.yamagandam, within(d.kalam.yamagandam, nowMs))}
        ${windowRow("Gulika", d.kalam.gulika, KAAL_INFO.gulika, within(d.kalam.gulika, nowMs))}</div>`,
      `<div class="pj-card pj-card-wide"><div class="pj-card-t">Muhurta &amp; kaals</div>
        ${windowRow("Abhijit", d.muhurta.abhijit, KAAL_INFO.abhijit, within(d.muhurta.abhijit, nowMs))}
        ${windowRow("Brahma", d.muhurta.brahma, KAAL_INFO.brahma, within(d.muhurta.brahma, nowMs))}
        ${windowRow("Madhyahna", d.muhurta.madhyahna, KAAL_INFO.madhyahna)}
        ${windowRow("Aparahna", d.muhurta.aparahna, KAAL_INFO.aparahna)}
        ${windowRow("Pradosha", d.muhurta.pradosha, KAAL_INFO.pradosha, within(d.muhurta.pradosha, nowMs))}
        ${windowRow("Nishita", d.muhurta.nishita, KAAL_INFO.nishita, within(d.muhurta.nishita, nowMs))}</div>`,
      // Phone alarms (Android app only): one-tap Clock-app alarms at tomorrow's computed times.
      ...(globalThis.KhagolAndroid?.setClockAlarm ? [
        `<div class="pj-card pj-card-wide"><div class="pj-card-t">⏰ Phone alarms — tomorrow</div>
          <div class="pj-alarm-row">
            <button class="pj-alarm" type="button" data-kind="sunrise">Sunrise</button>
            <button class="pj-alarm" type="button" data-kind="brahma">Brahma muhurta</button>
          </div>
          <div class="pj-alarm-hint">Sets a one-time alarm in your Clock app at tomorrow's time for this
          location (manage or delete it there).</div></div>`] : []),
      guidanceCardHtml(d),
    ].join("");
    grid.querySelectorAll(".pj-alarm").forEach((b) => {
      b.onclick = () => hooks.onSetAlarm && hooks.onSetAlarm(b.dataset.kind, b);
    });

    renderTimeline(nowMs);
    foot.innerHTML = `Ayanamsa: <b>${d.ayanamsa}</b> (${d.ayanamsa_deg.toFixed(3)}°) · drik (computed), South-Indian Amanta · times in ${d.location.tz}`;
  }

  // "Today's guidance" (Section B): tithi-group/vara/yoga/karana significance, plus personal
  // tara-bala/chandra-bala when a kundali has been cast (localStorage["kundali.janma"]).
  function guidanceCardHtml(d) {
    let janma = null;
    try { janma = JSON.parse(localStorage.getItem("kundali.janma") || "null"); } catch { janma = null; }
    const g = dayGuidance(
      d.tithi_at_sunrise.number - 1, d.vara_index, d.yoga.number - 1, d.karana.name,
      d.nakshatra_at_sunrise.number - 1, janma,
    );
    const personalHtml = g.personal
      ? `<div class="pj-guide-personal">
          <div class="pj-guide-t">For you (from your janma nakshatra)</div>
          <div class="pj-guide-row">Tara-bala: <b>${i18n.tr(g.personal.tara.name)}</b> (#${g.personal.tara.count}) — ${g.personal.tara.text}</div>
          <div class="pj-guide-row">Chandra-bala: house ${g.personal.chandra_bala.house} — ${g.personal.chandra_bala.text}</div>
        </div>`
      : `<div class="pj-guide-personal kj-muted">Cast your Kundali once to see personal tara-bala here.</div>`;
    return `<div class="pj-card pj-card-wide">
      <div class="pj-card-t">Today's guidance</div>
      <div class="pj-guide-row">Tithi: <b>${i18n.tr(g.tithi.group)}</b> — ${g.tithi.text}</div>
      <div class="pj-guide-row">Vara: ${g.vara.text}</div>
      <div class="pj-guide-row">Yoga: <b>${i18n.tr(g.yoga.name)}</b> — ${g.yoga.text}</div>
      <div class="pj-guide-row">Karana: <b>${i18n.tr(g.karana.name)}</b> — ${g.karana.text}</div>
      ${personalHtml}
      <div class="kj-foot">${g.disclaimer}</div>
    </div>`;
  }

  // Day timeline strip: choghadiya tiles + hora lords + kalam overlays + now cursor.
  function renderTimeline(nowMs) {
    const d = data;
    const t0 = inst(d.solar_day.governing_sunrise), t1 = inst(d.solar_day.next_sunrise);
    const span = t1 - t0;
    const pct = (s) => Math.max(0, Math.min(100, (inst(s) - t0) / span * 100));
    let html = "";
    for (const c of d.choghadiya) {
      const l = pct(c.start), w = pct(c.end) - l;
      html += `<div class="pj-seg ${c.good ? "good" : "bad"}" style="left:${l}%;width:${w}%" title="${c.name} (${c.lord})">${w > 4 ? c.name : ""}</div>`;
    }
    for (const h of d.hora) {
      const l = pct(h.start), w = pct(h.end) - l;
      html += `<div class="pj-hora" style="left:${l}%;width:${w}%" title="Hora: ${h.lord}">${w > 3 ? h.lord.slice(0, 2) : ""}</div>`;
    }
    for (const [k, cls] of [["rahu", "rahu"], ["yamagandam", "yama"], ["gulika", "gulika"]]) {
      const w = d.kalam[k]; if (!w) continue;
      html += `<div class="pj-kovl ${cls}" style="left:${pct(w.start)}%;width:${pct(w.end) - pct(w.start)}%" title="${k}"></div>`;
    }
    for (const m of ["abhijit", "brahma"]) {
      const w = d.muhurta[m]; if (!w) continue;
      html += `<div class="pj-marker" style="left:${pct(w.start)}%" title="${m}"></div>`;
    }
    // midnight tick + now cursor
    const sunset = inst(d.sun.sunset_local);
    if (sunset > t0 && sunset < t1) {
      const mid = sunset + (t1 - sunset) / 2;
      html += `<div class="pj-mid" style="left:${(mid - t0) / span * 100}%" title="solar midnight"></div>`;
    }
    if (nowMs >= t0 && nowMs <= t1) {
      html += `<div class="pj-now" style="left:${(nowMs - t0) / span * 100}%"></div>`;
    }
    timeline.innerHTML = html;
  }

  // --- public --------------------------------------------------------------
  return {
    update(d, nowMs) { data = d; banner.hidden = true; render(nowMs); },
    tick(nowMs) { if (data && banner.hidden) render(nowMs); },
    setSavedEvents(arr) { savedEvents = arr || []; if (data && banner.hidden) render(state.simTime().getTime()); },
    showPaused(frozenLabel) {
      banner.hidden = false;
      banner.textContent = `⏸ Panchang paused during time-lapse — values as of ${frozenLabel}`;
    },
    showLoading() { grid.innerHTML = `<div class="pj-card pj-skeleton"></div>`.repeat(6); },
  };
}
