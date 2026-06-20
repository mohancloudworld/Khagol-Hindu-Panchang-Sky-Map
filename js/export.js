// export.js -- PNG export of the canvas views (Phase 9D.4). Captures the view via its
// snapshot() (a synchronous render + toDataURL), composites a footer strip (context + app
// name) on an offscreen 2D canvas, and downloads sky-YYYYMMDD-HHmm.png.

const FOOTER_H = 40;

function stamp(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Capture `view` (must expose snapshot()) and download a footed PNG. `footerText` is the
// left-hand caption (location + local time, or sim time + view name for the orrery).
export function exportView(view, footerText) {
  if (!view || !view.snapshot) return;
  const dataUrl = view.snapshot();
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height + FOOTER_H;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    ctx.fillStyle = "#0b0e1a";
    ctx.fillRect(0, img.height, c.width, FOOTER_H);
    ctx.textBaseline = "middle";
    ctx.font = "14px system-ui, sans-serif";
    ctx.textAlign = "left"; ctx.fillStyle = "#c8d2ea";
    ctx.fillText(footerText, 12, img.height + FOOTER_H / 2);
    ctx.textAlign = "right"; ctx.fillStyle = "#e0a93a";
    ctx.fillText("Khagol — Hindu Panchang & Sky Map", c.width - 12, img.height + FOOTER_H / 2);
    c.toBlob((blob) => { if (blob) download(blob, `sky-${stamp(new Date())}.png`); }, "image/png");
  };
  img.src = dataUrl;
}
