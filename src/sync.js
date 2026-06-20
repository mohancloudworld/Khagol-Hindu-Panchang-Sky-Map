// Shared location + date/time state across the two extension contexts (the sky-map app.html and the
// browser-action popup). Both read/write one object in browser.storage.local and can listen for the
// other's changes, so a location or date/time set in one shows up in the other.
//
//   { lat, lon, zone, label, wall }   wall = "YYYY-MM-DDTHH:MM" (a pinned local time) or null = "now"

const B = globalThis.browser ?? globalThis.chrome;
const KEY = "sync";

export async function getSync() {
  try {
    const r = await B.storage.local.get([KEY, "loc"]);
    // Fall back to the popup's legacy `loc` (location only) so an existing saved city still applies.
    return r[KEY] || (r.loc ? { ...r.loc, wall: null } : null);
  } catch { return null; }
}

export async function setSync(patch) {
  try {
    const r = await B.storage.local.get(KEY);
    const next = { ...(r[KEY] || {}), ...patch };
    await B.storage.local.set({ [KEY]: next, loc: next });   // keep legacy `loc` in step for the popup
    return next;
  } catch { return null; }
}

// Subscribe to changes made by the OTHER context. Returns an unsubscribe fn. (storage.onChanged also
// fires in the writer's own context, so callers guard against echoing their own writes.)
export function onSyncChange(cb) {
  if (!B?.storage?.onChanged) return () => {};
  const h = (changes, area) => { if (area === "local" && changes[KEY]) cb(changes[KEY].newValue || null); };
  B.storage.onChanged.addListener(h);
  return () => B.storage.onChanged.removeListener(h);
}
