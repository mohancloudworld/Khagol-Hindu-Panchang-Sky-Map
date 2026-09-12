// In-app debug log (ring buffer) exportable as a text file — for field debugging on phones,
// where there is no devtools console. dlog() lines land here (with timestamps), console
// warnings/errors and uncaught errors are mirrored in, and "⚙ → Save debug log" writes the
// whole buffer to Downloads (Android bridge) or a normal download (browser).
const MAX = 4000;
const buf = [];

const fmt = (a) => {
  if (a instanceof Error) return `${a.name}: ${a.message}`;
  if (typeof a === "object") { try { return JSON.stringify(a); } catch { return String(a); } }
  return String(a);
};

export function dlog(...args) {
  const t = new Date();
  const ts = `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}:${String(t.getSeconds()).padStart(2, "0")}.${String(t.getMilliseconds()).padStart(3, "0")}`;
  buf.push(`${ts} ${args.map(fmt).join(" ")}`);
  if (buf.length > MAX) buf.splice(0, buf.length - MAX);
}

export function init() {
  dlog("=== Khagol debug log ===");
  dlog("ua:", navigator.userAgent);
  dlog("screen:", `${screen.width}x${screen.height}`, "dpr:", devicePixelRatio);
  dlog("bridge:", globalThis.KhagolAndroid ? Object.getOwnPropertyNames(Object.getPrototypeOf(globalThis.KhagolAndroid) || {}).join(",") || "present" : "none");
  for (const level of ["warn", "error"]) {
    const orig = console[level].bind(console);
    console[level] = (...a) => { dlog(`console.${level}:`, ...a); orig(...a); };
  }
  window.addEventListener("error", (e) => dlog("uncaught:", e.message, `${e.filename}:${e.lineno}`));
  window.addEventListener("unhandledrejection", (e) => dlog("unhandled-rejection:", e.reason));
}

export function save() {
  const name = `khagol-debug-${Date.now()}.txt`;
  const text = buf.join("\n") + "\n";
  if (globalThis.KhagolAndroid?.saveFile) {
    globalThis.KhagolAndroid.saveFile(name, "text/plain", btoa(unescape(encodeURIComponent(text))));
    return name;
  }
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return name;
}
