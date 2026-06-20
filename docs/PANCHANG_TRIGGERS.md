# Panchang triggers (kaal rules) + a worked longitude example

Reference for **which element is decided by which instant** (sunrise, sunset, midnight,
moonrise, …) and a concrete demonstration of how sensitive these are to location. The rules
below are the ones Khagol implements (`src/`); the compute layer is validated against an
independent reference engine (see `BUILD.md`).

---

## 1. What each element is decided by

| Element | Decided at | Rule |
|---|---|---|
| **Tithi of the day** | **Sunrise (udaya)** | the tithi *prevailing at local sunrise* governs the civil day; handles kshaya (a tithi touching no sunrise) and vriddhi (spanning two sunrises) |
| **Paksha** | Sunrise | from the sunrise tithi (Shukla 1–15, Krishna 1–15) |
| **Masa** (amanta month) | New moon → new moon (sampled at sunrise) | the lunar month bounded by two new moons (the one containing the day's sunrise); **named after the solar month — the Sun's sidereal rashi — entered during it** (`MASA[(r1+1)%12]`, r1 = Sun's rashi at the opening new moon); *adhika* (leap) when no Sankranti falls inside |
| **Vara (weekday)** | headline = civil date; solar-day vara = sunrise→sunrise | the **headline `vara`** is the Gregorian weekday of the queried civil date. The **solar-day** vara (`vara_now`, under `solar_day`) runs **sunrise→sunrise** — before sunrise (`is_pre_dawn`) it is still the *previous* day's. The two coincide except before sunrise. |
| **Nakshatra of the day** | **Sunrise (udaya)** | the nakshatra *prevailing at sunrise* — this is the dashboard's headline **Nakshatra** card (`nakshatra_at_sunrise`), just like Tithi |
| **Yoga, Karana** | **The query instant** | computed at the moment you ask (`jd_now`); the dashboard shows **no** at-sunrise variant for these two |
| **`tithi_now` / `nakshatra_now`** | The query instant | the same tithi/nakshatra recomputed at the moment you ask — shown as sub-text on the Tithi card, and the basis of the Kundali's **janma** values (Moon's nakshatra at the *birth instant*, which is why Kundali janma-nakshatra can differ in pada from the Panchang's sunrise nakshatra) |
| **Samvatsara** (60-yr) | Ugadi (sunrise) | saka-year mapping relative to that year's Ugadi date |
| **Sankranti** | Sunrise | Sun changes sidereal rashi between two consecutive sunrises |

## 1a. Kshaya (skipped) and vriddhi (repeated) tithis — how they're represented

A day's *nominal* tithi is the one prevailing at its **sunrise** (§1). Because a tithi
(~19–26 h) and a solar day (~24 h) differ in length, two edge cases arise:

- **Kshaya (skipped):** a tithi that **begins after one sunrise and ends before the next** — it
  touches *no* sunrise, so **no day "has" it**; the day-tithi sequence skips that number.
- **Vriddhi (repeated):** a tithi that **spans two sunrises** — it is the sunrise tithi on
  **two consecutive days**, so that number repeats.

**How it's represented (the resolution to "no day has this tithi"):**
- the daily calendar labels each day by its **sunrise** tithi, so a kshaya tithi simply doesn't
  appear as any day's tithi (and a vriddhi tithi appears on two days);
- the continuous **`tithi_now`** value still shows the kshaya tithi if you query *during* its band;
- an observance anchored to a kshaya tithi falls back to **the civil day the tithi begins**.

**Worked example — Chaitra Shukla Pratipada, 2026 (Hyderabad).** The tithi-at-sunrise sequence
jumps straight from #30 to #2:

| Day | Sunrise (IST) | Tithi at sunrise |
|---|---|---|
| 2026-03-18 | 06:22 | #29 Krishna Chaturdashi |
| 2026-03-19 | 06:21 | #30 Krishna Amavasya |
| 2026-03-20 | 06:20 | **#2 Shukla Dwitiya** |
| 2026-03-21 | 06:19 | #3 Shukla Tritiya |

**#1 Shukla Pratipada is missing.** It begins 03-19 **06:53** (32 min *after* that day's sunrise)
and ends 03-20 **04:53** (~1.5 h *before* the next sunrise) — touching no sunrise. So **Ugadi
2026 falls on 2026-03-19** (the day Pratipada *begins*) even though that day's sunrise tithi is
Amavasya. Khagol matches the independent reference engine here exactly.

The mirror case (vriddhi) puts the same tithi number at sunrise on two consecutive days; a
sunrise-triggered festival on such a tithi then uses the standard udaya pick (the first
qualifying sunrise).

## 2. The kaal windows (what each "trigger" means)

| Kaal | Instant / window |
|---|---|
| **Udaya** | local **sunrise** |
| **Madhyahna** | midday — 3rd fifth of sunrise→sunset (`day×2/5 … 3/5`) |
| **Aparahna** | afternoon — 4th fifth of the day (`day×3/5 … 4/5`) |
| **Pradosha** | **sunset** → sunset + 1/5 of the night |
| **Nishita** | **solar midnight** — 8th of 15 night-muhurtas |
| **Chandrodaya** | **moonrise** |
| **Abhijit** | solar **noon** — 8th of 15 day-muhurtas |
| **Brahma muhurta** | 96–48 min **before sunrise** |

## 3. Festivals by trigger (the 15 implemented)

| Festival | Masa · Paksha · Tithi | **Trigger** |
|---|---|---|
| Ugadi | Chaitra · Shukla · 1 | sunrise (udaya) |
| Akshaya Tritiya | Vaishakha · Shukla · 3 | sunrise |
| Guru Purnima | Ashadha · Shukla · 15 | sunrise |
| Sharad Navaratri begins | Ashwina · Shukla · 1 | sunrise |
| Naraka Chaturdashi | Ashwina · Krishna · 14 | sunrise |
| Karthika Purnima | Kartika · Shukla · 15 | sunrise |
| Vaikuntha Ekadashi | Margashirsha · Shukla · 11 | sunrise |
| Rama Navami | Chaitra · Shukla · 9 | **midday (madhyahna)** |
| Vinayaka Chaturthi | Bhadrapada · Shukla · 4 | **midday (madhyahna)** |
| Vijayadashami | Ashwina · Shukla · 10 | **afternoon (aparahna)** |
| Deepavali | Ashwina · Krishna · 15 | **sunset (pradosha)** |
| Holika Dahan | Phalguna · Shukla · 15 | **sunset (pradosha)** |
| Krishna Janmashtami | Shravana · Krishna · 8 | **midnight (nishita)** — smarta/vaishnava split |
| Maha Shivaratri | Magha · Krishna · 14 | **midnight (nishita)** |
| Karwa Chauth | Ashwina · Krishna · 4 | **moonrise (chandrodaya)** |

Determination (general, not "tithi == target at sunrise"): find the absolute time-band of the
target tithi inside the correct lunar month, then pick the civil day by the rule's kaal —
greatest-overlap for interval kaals, the day whose sunrise/moonrise/midnight falls in the band
otherwise. A festival is flagged **disputed** only when it has a known regional split *and* the
two traditions land on different days that year (e.g. Janmashtami: nishita = Smarta day vs
udaya = Vaishnava day).

## 4. Day-quality windows (sunrise/sunset based; not festival triggers)

- **Rahu Kalam / Yamagandam / Gulika** — the daytime (sunrise→sunset) split into 8 equal parts;
  the weekday selects which eighth each occupies.
- **Hora** — 24 planetary hours: 12 sunrise→sunset, 12 sunset→next sunrise.
- **Choghadiya** — 8 daytime + 8 night segments, each auspicious or not.

---

## 5. Worked example — how sensitive sunrise-triggered results are to location

Three points at the **same latitude (17.385°N)** and the **same clock (IST)**, differing only
in longitude (1° longitude = 4 min of solar time):

| Point | Longitude | Solar time vs Hyderabad |
|---|---|---|
| Hyderabad | 78.486°E | — |
| Point-W1 | 78.236°E | −1.0 min |
| Point-W | 77.886°E | −2.4 min |

**Tithi at sunrise flips with these tiny shifts** (computed values, 2020–2035 edge dates):

| Date | Hyderabad | Point-W1 (−1 min) | Point-W (−2.4 min) | Hyderabad margin¹ |
|---|---|---|---|---|
| 2021-04-11 | Chaturdashi | **Amavasya** | **Amavasya** | +32 s |
| 2024-03-06 | Dashami | **Ekadashi** | **Ekadashi** | +34 s |
| 2034-03-04 | Chaturdashi | **Purnima** | **Purnima** | +45 s |
| 2029-06-29 | Tritiya | Tritiya | **Chaturthi** | +87 s |
| 2032-03-27 | Purnima | Purnima | **Pratipada** | +110 s |

¹ seconds from Hyderabad sunrise to the tithi boundary. Margins **< 60 s** flip even at −1 min;
**60–144 s** survive −1 min but flip at −2.4 min. So two towns ~25–65 km apart on the same
clock can legitimately observe a **different tithi at sunrise — and a different festival day —**
on these edge dates. That is correct astronomy, not an engine error.

**Tightest cases are location-specific.** The "closest to sunrise" date differs per location
(it depends on the exact sunrise instant). Hyderabad's tightest in 2020–2035 is **32 s**
(2021-04-11); Point-W's is **1.6 s** — 2028-12-17, Shukla Pratipada ends 1.6 s after sunrise.

### Honest limit at sub-~3-second margins
On 2028-12-17 (Point-W) Khagol still matched the reference engine (both *Shukla Pratipada*), but
only just: boundary 06:41:53, reference sunrise 06:41:51, Khagol sunrise 06:41:52 — both land
barely before the boundary. At margins below ~3 s, agreement is **within the noise**: Khagol's
rise/set algorithm differs from the reference by ~1–3 s (see `BUILD.md`), comparable to the margin.
More fundamentally, at that scale the result is **physically ambiguous** — real horizon
refraction varies with weather by far more than a second — so *no* engine or almanac can claim
authority on which tithi prevails when the boundary is ~1 s from sunrise. Above ~10 s the
engines agree solidly.

*(These margins come from a 16-year scan cross-checked against an independent reference engine;
see `BUILD.md`.)*
