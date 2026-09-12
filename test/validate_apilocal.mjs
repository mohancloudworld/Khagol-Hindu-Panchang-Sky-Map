// End-to-end seam test: exercise api-local.js exactly as the browser would, with fetch
// polyfilled to read the bundled extension/data/ files. Validates the full wiring
// (WASM init, data loading, nearest-city tz, local-ISO->UTC) + the compute.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const real = globalThis.fetch;
globalThis.fetch = async (url) => {
  const u = url instanceof URL ? url : new URL(url);
  if (u.protocol === "file:") { const b = await readFile(fileURLToPath(u)); return { ok: true, json: async () => JSON.parse(b.toString()) }; }
  return real(url);
};
const api = await import("../src/api-local.js");
let ok = true; const chk = (l, a, b) => { const p = a === b; if (!p) ok = false; console.log(`${p ? "OK  " : "FAIL"} ${l}: ${a}${p ? "" : " != " + b}`); };

const p = await api.fetchPanchang(17.385, 78.486, new Date("2026-06-15T06:30:00Z"), "auto", "lahiri");
chk("tz auto->nearest city", p.location.tz, "Asia/Kolkata");
chk("panchang tithi@sr", p.tithi_at_sunrise.display, "Krishna Amavasya");
chk("panchang masa", p.masa.name, "Adhika Jyeshtha");
chk("fetchTz", (await api.fetchTz(17.385, 78.486)).tz, "Asia/Kolkata");
chk("fetchStars count", (await api.fetchStars()).stars.length, 5043);
chk("fetchConstellations", Object.keys(await api.fetchConstellations()).length, 88);
chk("fetchAyanamsa", (await api.fetchAyanamsa(new Date("2026-06-15T06:00:00Z"))).ayanamsa_deg, 24.2266);
const k = await api.fetchKundali({ dt: "2000-01-01T12:00:00", lat: 17.385, lon: 78.486, tz: "Asia/Kolkata", node: "mean", ayanamsa: "lahiri" });
chk("kundali lagna (local->UTC)", k.lagna.rashi_name, "Meena");
chk("kundali moon", k.grahas.find((g) => g.id === "moon").rashi_name, "Tula");
const sky = await api.fetchSky(17.385, 78.486, new Date("2026-06-15T06:00:00Z"));
chk("sky bodies", sky.bodies.length, 9);
const tr = await api.fetchOrreryTrails(new Date("2026-06-15T06:00:00Z"));
chk("trails moon pts", tr.trails.moon.length, 256);
console.log(ok ? "\nAPI-LOCAL SEAM PASS — full surface works end-to-end." : "\nAPI-LOCAL SEAM FAIL");
process.exit(ok ? 0 : 1);
