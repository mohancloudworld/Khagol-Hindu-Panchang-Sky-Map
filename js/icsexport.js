// Calendar export (Phase 10): festivals + user-saved tithi dates for a year -> a standard .ics
// file the user imports into Google Calendar (ideally into a dedicated "Khagol" calendar, which
// keeps it a separate colour/category and one-click removable). All-day events; everything is
// computed locally from the already-validated month engine (one pass over the year's months, so
// festivals include Sankrantis and saved dates recur by tithi + masa exactly like the calendar).
import * as api from "./api.js";
import * as sev from "../src/savedevents.js";

// RFC 5545 text escaping + 74-octet line folding (continuation lines start with a space).
const esc = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const fold = (line) => {
  const out = [];
  let rest = line;
  while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = " " + rest.slice(74); }
  out.push(rest);
  return out.join("\r\n");
};

function vevent({ ymd, title, desc, uid }) {
  const d = ymd.replace(/-/g, "");
  const next = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10) + 1));
  const dEnd = `${next.getUTCFullYear()}${String(next.getUTCMonth() + 1).padStart(2, "0")}${String(next.getUTCDate()).padStart(2, "0")}`;
  return [
    "BEGIN:VEVENT",
    fold(`UID:${uid}`),
    `DTSTAMP:${d}T000000Z`,
    `DTSTART;VALUE=DATE:${d}`,
    `DTEND;VALUE=DATE:${dEnd}`,
    fold(`SUMMARY:${esc(title)}`),
    fold(`DESCRIPTION:${esc(desc)}`),
    "CATEGORIES:Khagol",
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
  ].join("\r\n");
}

// Timed VEVENT (contrast the all-day one above). Eclipses are the only export with real
// clock times: a grahana is an interval, not a day, and the UTC instants are the honest way
// to write it — the importing calendar renders them in whatever zone the reader is in, which
// is exactly right for an event the whole hemisphere shares.
const stampUtc = (iso) => iso.replace(/[-:]/g, "").replace(/\.\d+/, "");

function veventTimed({ startUtc, endUtc, title, desc, uid }) {
  return [
    "BEGIN:VEVENT",
    fold(`UID:${uid}`),
    `DTSTAMP:${stampUtc(startUtc)}`,
    `DTSTART:${stampUtc(startUtc)}`,
    `DTEND:${stampUtc(endUtc)}`,
    fold(`SUMMARY:${esc(title)}`),
    fold(`DESCRIPTION:${esc(desc)}`),
    "CATEGORIES:Khagol",
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
  ].join("\r\n");
}

// One grahana -> a timed event spanning its outermost contacts (penumbral for a lunar
// eclipse, first-to-fourth contact for a solar one where it is visible).
function grahanaEvent(day, g) {
  const lunar = g.kind === "lunar";
  const startUtc = lunar ? (g.penumbral_begin || g.partial_begin)
                         : ((g.local && g.local.first_contact) || g.begin);
  const endUtc = lunar ? (g.penumbral_end || g.partial_end)
                       : ((g.local && g.local.fourth_contact) || g.end);
  if (!startUtc || !endUtc) return null;
  const clock = (s) => (s ? s.slice(11, 16) : "—");
  const bits = [
    `${g.type} ${lunar ? "lunar" : "solar"} eclipse`,
    `maximum ${clock(g.max_local)} local`,
    lunar ? `umbral magnitude ${g.umbral_magnitude.toFixed(2)}`
          : (g.local ? `${Math.round(g.local.obscuration * 100)}% of the Sun covered` : ""),
    g.visible_here === false ? "not visible from your location" : "visible from your location",
    g.saros ? `Saros ${g.saros.series}/${g.saros.member}` : "",
    // tithi_at_sunrise is the display form and already carries the paksha.
    `${day.masa} ${day.tithi_at_sunrise}`,
  ];
  return veventTimed({
    startUtc, endUtc,
    title: `${lunar ? "☾" : "☉"} ${g.grahana} — ${g.type}`,
    desc: bits.filter(Boolean).join(" · ") + " — Khagol Panchang",
    uid: `khagol-grahana-${day.date}-${g.kind}@mohancloudworld.github.io`,
  });
}

// Scan each year's months once; collect what was asked for. Returns { ics, nFest, nSaved, nEclipse }.
// The span is capped (12 years) — each year costs a full month-engine pass.
export async function buildIcsRange({ yearFrom, yearTo, festivals, saved, eclipses, lat, lon, tz, ayanamsa }) {
  const y0 = Math.min(yearFrom, yearTo), y1 = Math.max(yearFrom, yearTo);
  if (y1 - y0 + 1 > 12) throw new Error("range too large (max 12 years)");
  const events = [];
  let nFest = 0, nSaved = 0, nEclipse = 0;
  const savedEvents = saved ? await sev.listEvents() : [];
  for (let year = y0; year <= y1; year++) for (let m = 1; m <= 12; m++) {
    const days = await api.fetchMonth(year, m, lat, lon, tz, ayanamsa);
    for (const day of days) {
      if (festivals) {
        for (const f of day.festivals || []) {
          nFest++;
          const bits = [day.masa + " " + day.paksha, day.tithi_at_sunrise, f.kaal ? `kaal: ${f.kaal}` : ""];
          if (f.disputed) bits.push("date varies by tradition");
          events.push(vevent({
            ymd: day.date, title: f.name,
            desc: bits.filter(Boolean).join(" · ") + " — Khagol Panchang",
            uid: `khagol-fest-${day.date}-${f.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}@mohancloudworld.github.io`,
          }));
        }
      }
      if (eclipses) {
        for (const g of day.grahana || []) {
          const ev = grahanaEvent(day, g);
          if (ev) { nEclipse++; events.push(ev); }
        }
      }
      if (saved && savedEvents.length) {
        for (const e of sev.matchDay(day.masa, day.tithi_n, savedEvents)) {
          nSaved++;
          events.push(vevent({
            ymd: day.date, title: `★ ${e.label}`,
            desc: `${e.masa} ${e.paksha} ${e.tithi_name} (saved tithi, recurs yearly) — Khagol Panchang`,
            uid: `khagol-saved-${e.id}-${year}@mohancloudworld.github.io`,
          }));
        }
      }
    }
  }
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Khagol//Hindu Panchang//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Khagol Panchang",
    events.join("\r\n"),
    "END:VCALENDAR",
  ].join("\r\n") + "\r\n";
  return { ics, nFest, nSaved, nEclipse };
}

// Deliver the .ics. Android: openIcs hands it straight to the calendar-import chooser (pick
// Google Calendar -> events import in one tap); older bridge falls back to a Downloads save.
// Browsers get a normal download.
export function saveIcs(name, text) {
  const A = globalThis.KhagolAndroid;
  if (A?.openIcs) { A.openIcs(name, btoa(unescape(encodeURIComponent(text)))); return; }
  if (A?.saveFile) { A.saveFile(name, "text/calendar", btoa(unescape(encodeURIComponent(text)))); return; }
  const url = URL.createObjectURL(new Blob([text], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
