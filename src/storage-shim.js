// Storage backend for sync.js / savedevents.js: the WebExtension storage API when available
// (extension), else a localStorage-backed shim with the same tiny surface (Android WebView,
// plain browser). Shim change events fire only in-context — fine, since only the extension
// has a second context (the popup) and it always has the real API.

function makeShim() {
  const listeners = new Set();
  const P = "webext.";   // localStorage key prefix
  const read = (k) => {
    try { const v = localStorage.getItem(P + k); return v == null ? undefined : JSON.parse(v); }
    catch { return undefined; }
  };
  return {
    storage: {
      local: {
        async get(keys) {
          const out = {};
          for (const k of (Array.isArray(keys) ? keys : [keys])) {
            const v = read(k);
            if (v !== undefined) out[k] = v;
          }
          return out;
        },
        async set(obj) {
          const changes = {};
          for (const [k, v] of Object.entries(obj)) {
            changes[k] = { oldValue: read(k), newValue: v };
            try { localStorage.setItem(P + k, JSON.stringify(v)); } catch { /* quota */ }
          }
          for (const h of listeners) { try { h(changes, "local"); } catch { /* listener */ } }
        },
      },
      onChanged: {
        addListener(h) { listeners.add(h); },
        removeListener(h) { listeners.delete(h); },
      },
    },
  };
}

const ext = globalThis.browser ?? globalThis.chrome;
export const B = ext?.storage?.local ? ext : makeShim();
