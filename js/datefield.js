// datefield.js -- typed date entry, shared by every date field in the app.
//
// A native <input type="date"> pages month by month, so a date twenty years back is a few
// hundred taps (and the year jump, where a platform has one, is a hidden gesture). Every date
// field is therefore kept as a HIDDEN native input -- its value, change events and
// persistence stay exactly as they were -- fronted by three numeric boxes: type 1998 05 23
// and it flows straight through, auto-advancing between boxes. A 📅 button still opens the
// native picker for anyone who wants to browse.
//
// `opts.time` handles a datetime-local field the same way, with an HH:MM box after the day.

const DIM = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();   // days in month m (1..12)
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Smart 24h mask applied live as the user types: digits auto-format to "HH:MM". A leading
// 3-9 (can't begin a two-digit hour) pads to "0X:" and advances to minutes, mirroring the
// old native picker. Returns the partial-but-tidy string to write back into the input.
export function maskTime(raw) {
  const d = raw.replace(/\D/g, "").slice(0, 4);
  if (!d) return "";
  let h, rest;
  if (d[0] >= "3") { h = "0" + d[0]; rest = d.slice(1); }           // 3-9 -> single-digit hour
  else if (d.length === 1) return d;                               // 0/1/2 -> await 2nd digit
  else if (+d.slice(0, 2) <= 23) { h = d.slice(0, 2); rest = d.slice(2); }
  else { h = "0" + d[0]; rest = d.slice(1); }                      // e.g. 25 -> 02, push to min
  let m = rest.slice(0, 2);
  if (m.length === 1 && m > "5") m = "0" + m;                      // 7 -> 07
  if (m.length === 2 && +m > 59) m = "59";
  return m.length ? `${h}:${m}` : `${h}:`;
}

// Wire an HH:MM box: the mask runs on every keystroke, except that Backspace is allowed to
// eat the colon -- "02:" is re-masked to "02:" otherwise, and the hour could never be deleted
// without a tap into it.
export function wireTimeBox(el) {
  el.addEventListener("input", (e) => {
    const deleting = e.inputType && e.inputType.startsWith("delete");
    el.value = deleting && el.value.replace(/\D/g, "").length <= 2 ? el.value.replace(/\D/g, "") : maskTime(el.value);
  });
}

// Finalize whatever is in the field to a valid "HH:MM" (blank -> "00:00"); used on commit.
export function normTime(raw) {
  const m = maskTime(raw).match(/^(\d{1,2}):?(\d{0,2})$/);
  if (!m) return "00:00";
  const hh = String(Math.min(23, +m[1])).padStart(2, "0");
  const mm = (m[2] || "0").padStart(2, "0").slice(0, 2);
  return `${hh}:${mm}`;
}

// Front `dateEl` (a date or datetime-local input) with typed boxes. Returns { sync() } --
// call it after writing dateEl.value programmatically so the boxes catch up at once (a poll
// also picks such writes up within half a second, for callers that don't).
export function attachDateBoxes(dateEl, { min = 1600, max = 2600, time = false } = {}) {
  const row = document.createElement("span");
  row.className = "df-row" + (time ? " df-time" : "");
  const box = (cls, ph, len) =>
    `<input type="text" inputmode="numeric" class="df-box ${cls}" placeholder="${ph}" maxlength="${len}" autocomplete="off">`;
  row.innerHTML = box("df-y", "YYYY", 4) + box("df-m", "MM", 2) + box("df-d", "DD", 2)
    + (time ? box("df-t", "HH:MM", 5) : "")
    + `<button type="button" class="df-pick" title="open the calendar picker" aria-label="open the calendar picker">📅</button>`;
  // The native input moves inside the row (absolutely positioned, invisible, still rendered
  // -- showPicker() refuses an unrendered field, and anchors its popup to the row).
  dateEl.classList.add("df-hidden");
  dateEl.replaceWith(row);
  row.prepend(dateEl);
  const yEl = row.querySelector(".df-y"), mEl = row.querySelector(".df-m"), dEl = row.querySelector(".df-d");
  const tEl = row.querySelector(".df-t");
  const pick = row.querySelector(".df-pick");
  // showPicker() exists on every current engine (Chrome 99+, Firefox 101+, Android WebView);
  // where it doesn't, the picker button is simply hidden.
  if (typeof dateEl.showPicker === "function") {
    pick.onclick = () => {
      // Open the picker on whatever is typed so far -- a year alone lands on 1 Jan of that
      // year, year+month on the 1st -- rather than on today. The picker reads the value once
      // when it opens, so the seed is put back straight after: the field only changes when
      // a day is actually chosen (which fires change like any pick).
      const y = +yEl.value, m = +mEl.value || 1, d = Math.min(+dEl.value || 1, DIM(y, m));
      const seed = y >= min && y <= max ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : "";
      const keep = dateEl.value;
      if (seed) dateEl.value = seed + (time ? `T${tEl.value.trim() ? normTime(tEl.value) : "00:00"}` : "");
      try { dateEl.showPicker(); } catch { /* needs a user gesture; nothing else to do */ }
      dateEl.value = keep;
    };
  } else pick.hidden = true;

  // A box outside its range turns red and says why (nothing is pushed until it is fixed);
  // an impossible day-of-month is clamped rather than refused (31 Feb -> 28/29).
  const msg = document.createElement("span");
  msg.className = "df-msg";
  msg.hidden = true;
  row.after(msg);
  let note = false;   // a clamp note stays up until the user types again (an error replaces it)
  const flag = (el, bad, why) => {
    el.classList.toggle("df-bad", bad);
    if (bad) { note = false; msg.classList.remove("df-note"); msg.textContent = why; msg.hidden = false; }
    else if (!row.querySelector(".df-bad") && !note) msg.hidden = true;
  };
  const check = (typing = true) => {
    if (typing) { note = false; msg.classList.remove("df-note"); }
    const y = +yEl.value, m = +mEl.value, d = +dEl.value;
    flag(yEl, yEl.value !== "" && !(y >= min && y <= max), `year must be ${min}–${max}`);
    flag(mEl, mEl.value !== "" && !(m >= 1 && m <= 12), "month must be 01–12");
    flag(dEl, dEl.value !== "" && !(d >= 1 && d <= 31), "day must be 01–31");
    return !row.querySelector(".df-bad");
  };
  let pushed = "";
  const push = () => {
    if (!check()) return;
    const y = +yEl.value, m = +mEl.value;
    let d = +dEl.value;
    if (!(y >= min && y <= max && m >= 1 && m <= 12 && d >= 1)) return;
    if (d > DIM(y, m)) {                                              // 31 Feb -> 28/29, and say so
      d = DIM(y, m); dEl.value = String(d).padStart(2, "0");
      msg.textContent = `${MON[m - 1]} ${y} has only ${d} days — set to ${d}`;
      msg.classList.add("df-note"); msg.hidden = false; note = true;
    }
    let v = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (time) {   // a blank time box means midnight, but stays blank (typing into "00:00" would be a mess)
      const t = tEl.value.trim() ? normTime(tEl.value) : "00:00";
      if (tEl.value.trim()) tEl.value = t;
      v += `T${t}`;
    }
    if (v === dateEl.value) return;
    pushed = dateEl.value = v;
    dateEl.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const boxes = [yEl, mEl, dEl].concat(time ? [tEl] : []);
  if (tEl) wireTimeBox(tEl);
  for (const el of boxes) {
    el.addEventListener("change", push);
    el.addEventListener("input", () => {
      if (el === tEl) return;   // wireTimeBox handles it
      el.value = el.value.replace(/\D/g, "");
      // auto-advance once the segment is full, so 4-2-2 typing flows straight through --
      // but stay put on a bad value (22 for a month), so the red box is the one in focus
      const full = el === yEl ? 4 : 2;
      if (el.value.length >= full && check()) {
        const next = boxes[boxes.indexOf(el) + 1];
        if (next) { next.focus(); next.select?.(); }
        push();
      }
    });
  }
  // The boxes mirror the hidden field whenever the app writes it (Now, Load, a synced popup).
  const sync = () => {
    if (dateEl.value === pushed) return;
    pushed = dateEl.value;
    const m2 = pushed.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
    yEl.value = m2 ? m2[1] : ""; mEl.value = m2 ? m2[2] : ""; dEl.value = m2 ? m2[3] : "";
    if (tEl) tEl.value = m2 && m2[4] ? `${m2[4]}:${m2[5]}` : "";
    check(false);
  };
  dateEl.addEventListener("change", sync);   // the native picker, when it is used
  setInterval(sync, 500);
  sync();
  return { sync, row };
}
