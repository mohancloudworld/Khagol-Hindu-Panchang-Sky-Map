// Rahu Kalam / Yamagandam / Gulika, hora, choghadiya, ritual kaals. Pure time arithmetic on Date instants (UTC); the UI
// localizes. start/end are Date objects.
const ms = (d) => d.getTime();
const at = (base, deltaMs) => new Date(ms(base) + deltaMs);

// --- kalam.py ---
const RAHU = [8, 2, 7, 5, 6, 4, 3], YAMA = [5, 4, 3, 2, 1, 7, 6], GULIKA = [7, 6, 5, 4, 3, 2, 1];
function segment(sr, ss, n) {
  const seg = (ms(ss) - ms(sr)) / 8;
  return { start: at(sr, seg * (n - 1)), end: at(sr, seg * n) };
}
export function kalams(sr, ss, varaIdx) {
  return { rahu: segment(sr, ss, RAHU[varaIdx]), yamagandam: segment(sr, ss, YAMA[varaIdx]), gulika: segment(sr, ss, GULIKA[varaIdx]) };
}

// --- muhurta.py ---
export const WEEKDAY_LORD = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"];
const HORA_SEQ = ["Sun", "Venus", "Mercury", "Moon", "Saturn", "Jupiter", "Mars"];
const CHOGHADIYA_NAME = { Sun: "Udvega", Venus: "Chara", Mercury: "Labha", Moon: "Amrita", Saturn: "Kala", Jupiter: "Shubha", Mars: "Roga" };
const GOOD = new Set(["Chara", "Labha", "Amrita", "Shubha"]);
const win = (start, end) => ({ start, end });

export function ritualKaals(sr, ss, nextSr, moonrise = null) {
  const day = ms(ss) - ms(sr), night = ms(nextSr) - ms(ss), MIN = 60000;
  return {
    abhijit: win(at(sr, day * 7 / 15), at(sr, day * 8 / 15)),
    brahma: win(at(sr, -96 * MIN), at(sr, -48 * MIN)),
    madhyahna: win(at(sr, day * 2 / 5), at(sr, day * 3 / 5)),
    aparahna: win(at(sr, day * 3 / 5), at(sr, day * 4 / 5)),
    nishita: win(at(ss, night * 7 / 15), at(ss, night * 8 / 15)),
    pradosha: win(ss, at(ss, night / 5)),
    chandrodaya: moonrise ? win(moonrise, moonrise) : null,
  };
}

export function horas(sr, ss, nextSr, varaIdx) {
  const start = HORA_SEQ.indexOf(WEEKDAY_LORD[varaIdx]);
  const daySeg = (ms(ss) - ms(sr)) / 12, nightSeg = (ms(nextSr) - ms(ss)) / 12, out = [];
  for (let i = 0; i < 12; i++) out.push({ lord: HORA_SEQ[(start + i) % 7], start: at(sr, daySeg * i), end: at(sr, daySeg * (i + 1)) });
  for (let i = 0; i < 12; i++) out.push({ lord: HORA_SEQ[(start + 12 + i) % 7], start: at(ss, nightSeg * i), end: at(ss, nightSeg * (i + 1)) });
  return out;
}

function choghadiyaBlock(start, spanUnit, firstLord) {
  const idx = HORA_SEQ.indexOf(firstLord), out = [];
  for (let i = 0; i < 8; i++) {
    const lord = HORA_SEQ[(idx + i) % 7], name = CHOGHADIYA_NAME[lord];
    out.push({ name, good: GOOD.has(name), lord, start: at(start, spanUnit * i), end: at(start, spanUnit * (i + 1)) });
  }
  return out;
}
export function choghadiya(sr, ss, nextSr, varaIdx) {
  const day = choghadiyaBlock(sr, (ms(ss) - ms(sr)) / 8, WEEKDAY_LORD[varaIdx]);
  const night = choghadiyaBlock(ss, (ms(nextSr) - ms(ss)) / 8, WEEKDAY_LORD[(varaIdx + 4) % 7]);
  return day.concat(night);
}
