// DST-aware timezone helpers keyed by IANA zone name (e.g. "America/Chicago"), via Intl —
// no data tables, works in the extension and Node. Replaces the earlier fixed-offset model
// so clock fields and local-day boundaries are correct across DST transitions.
const JD_UNIX = 2440587.5;
export const jdToDate = (jd) => new Date((jd - JD_UNIX) * 86400000);
export const dateToJd = (dt) => dt.getTime() / 86400000 + JD_UNIX;
export const addDays = (ymd, n) => { const t = new Date(Date.UTC(ymd.y, ymd.mo - 1, ymd.d + n)); return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate() }; };
export const cmpYMD = (a) => a.y * 10000 + a.mo * 100 + a.d;
export const isoYMD = (a) => `${a.y}-${String(a.mo).padStart(2, "0")}-${String(a.d).padStart(2, "0")}`;

const _parts = (date, zone, opts) => {
  const m = {};
  for (const p of new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", ...opts }).formatToParts(date)) m[p.type] = p.value;
  return m;
};

// UTC offset (hours) of `zone` at instant `date` (DST-aware).
export function offsetHours(date, zone) {
  const m = _parts(date, zone, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour, +m.minute, +m.second);
  return (asUTC - date.getTime()) / 3600000;
}

// Local civil date {y,mo,d} of an instant in `zone`.
export function ymdOfInstant(date, zone) {
  const m = _parts(date, zone, { year: "numeric", month: "2-digit", day: "2-digit" });
  return { y: +m.year, mo: +m.month, d: +m.day };
}

// Local wall clock "HH:MM:SS" of an instant in `zone`.
export function clockHMS(date, zone) {
  const m = _parts(date, zone, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return `${m.hour}:${m.minute}:${m.second}`;
}

// Local ISO-8601 with offset, e.g. "2026-06-15T12:00:00+05:30" (matches Python isoformat()).
export function isoLocal(date, zone) {
  const y = ymdOfInstant(date, zone), hms = clockHMS(date, zone), off = offsetHours(date, zone);
  const s = off >= 0 ? "+" : "-", a = Math.abs(off), oh = Math.floor(a), om = Math.round((a - oh) * 60);
  const p = (n) => String(n).padStart(2, "0");
  return `${y.y}-${p(y.mo)}-${p(y.d)}T${hms}${s}${p(oh)}:${p(om)}`;
}

// JD (UT) of local midnight (00:00 wall) for civil date `ymd` in `zone` — DST-correct.
export function localMidnightJd(ymd, zone) {
  const wallAsUTC = Date.UTC(ymd.y, ymd.mo - 1, ymd.d, 0, 0, 0);
  let off = offsetHours(new Date(wallAsUTC), zone);
  let utc = wallAsUTC - off * 3600000;
  off = offsetHours(new Date(utc), zone);            // refine once across a DST edge
  utc = wallAsUTC - off * 3600000;
  return utc / 86400000 + JD_UNIX;
}
