// Validate src/interpret.js (via computeKundali) against the app's interpretation output
// (test/interp_ref.json). S1: 2000-01-01 12:00 Asia/Kolkata, Hyderabad, mean node, lahiri,
// pinned now = 2026-01-01T00:00:00Z (Section A.3).
import { readFileSync } from "node:fs";
import * as swe from "../src/sweph.js";
import { computeKundali } from "../src/kundali.js";

const ref = JSON.parse(readFileSync(new URL("./interp_ref.json", import.meta.url)));
await swe.init();
const got = computeKundali(new Date("2000-01-01T06:30:00Z"), 17.385, 78.486, {
  node: "mean", ayanamsa: "lahiri", zone: "Asia/Kolkata", now: new Date("2026-01-01T00:00:00Z"),
});

function firstDiff(path, a, b) {
  if (a === b) return null;
  if (typeof a !== typeof b) return { path, a, b };
  if (a === null || b === null || typeof a !== "object") return { path, a, b };
  if (Array.isArray(a) !== Array.isArray(b)) return { path, a, b };
  if (Array.isArray(a)) {
    if (a.length !== b.length) return { path: `${path}.length`, a: a.length, b: b.length };
    for (let i = 0; i < a.length; i++) {
      const d = firstDiff(`${path}[${i}]`, a[i], b[i]);
      if (d) return d;
    }
    return null;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const d = firstDiff(`${path}.${k}`, a[k], b[k]);
    if (d) return d;
  }
  return null;
}

const diff = firstDiff("interpretation", got.interpretation, ref.interpretation);
if (diff) {
  console.log(`FIRST DIFF at ${diff.path}:`);
  console.log(`  got: ${JSON.stringify(diff.a)}`);
  console.log(`  ref: ${JSON.stringify(diff.b)}`);
  console.log("\nINTERPRET PORT FAIL");
  process.exit(1);
}
console.log("all six pillars match byte-for-byte (temperament, mind, dignities, bhavas, timing, upayas)");
console.log("\nINTERPRET PORT PASS — matches the app.");
