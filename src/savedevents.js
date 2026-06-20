// User-saved location/date/time "events" (e.g. a birth tithi, an anniversary). Stored in
// browser.storage.local; their tithi+masa recurs yearly, marked in the Panchang + calendar
// (kept SEPARATE from festivals). Each record:
//   { id, label, lat, lon, zone, wall, masa, paksha, tithi_name, tithi_n }
//   wall = "YYYY-MM-DDTHH:MM" (the saved local time); tithi_n = 1..30 within the amanta masa.

const B = globalThis.browser ?? globalThis.chrome;
const KEY = "savedEvents";

export async function listEvents() {
  try { return (await B.storage.local.get(KEY))[KEY] || []; } catch { return []; }
}
async function write(arr) { try { await B.storage.local.set({ [KEY]: arr }); } catch { /* in-memory */ } return arr; }
export async function addEvent(ev) {
  const a = await listEvents();
  a.push({ ...ev, id: ev.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)) });
  return write(a);
}
export async function removeEvent(id) { return write((await listEvents()).filter((e) => e.id !== id)); }

export function onEventsChange(cb) {
  if (!B?.storage?.onChanged) return () => {};
  const h = (c, area) => { if (area === "local" && c[KEY]) cb(c[KEY].newValue || []); };
  B.storage.onChanged.addListener(h);
  return () => B.storage.onChanged.removeListener(h);
}

// Saved events that recur on a day with this amanta masa name + tithi number (tithi+masa = yearly).
export function matchDay(masaName, tithiN, events) {
  if (!events || tithiN == null) return [];
  return events.filter((e) => e.masa === masaName && e.tithi_n === tithiN);
}
