# features/temporal

**Status:** Phase 7 complete — sunrise/sunset, moonrise/moonset, moon
phase, day length, and a global 24h timeline, with real solunar
major/minor periods.

Unlike Phases 5/6 (weather/wind), this phase needs **no external
provider and no network call at all** — sun/moon positions are pure
astronomy, computable client-side. Verified via live research before
picking an approach: Open-Meteo's `daily=` API *does* expose
`sunrise`/`sunset`/`moonrise`/`moonset`/`moon_phase`, but using it would
mean a network dependency for data that doesn't need one — strictly worse
for an offline-first app. Instead this uses
[SunCalc](https://github.com/mourner/suncalc) (verified live against its
GitHub repo): dependency-free, based on the Astronomical Almanac's
low-precision solar/lunar position formulas (the same family NOAA's own
solar calculator uses). One licensing nuance worth recording: npm's
registry page shows SunCalc as "Proprietary" — that's only because its
`package.json` omits a `license` field; the actual `LICENSE` file in the
package (verified directly) is **BSD-2-Clause**, a real permissive
open-source license.

## `utils/temporal.ts`

Thin wrapper functions around SunCalc, converting its `Date` objects to
ISO strings and adding two things SunCalc doesn't provide directly:

- `moonPhaseName()` — buckets SunCalc's real continuous 0–1 phase
  fraction into the 8 conventional named phases (New/Waxing Crescent/
  First Quarter/Waxing Gibbous/Full/Waning Gibbous/Last Quarter/Waning
  Crescent). The bucket *widths* are a documented convention choice (the
  4 exact instants get narrow bands, the 4 "between" phases get most of
  the cycle), not a fabricated astronomical fact — the phase value itself
  is always SunCalc's real number.
- `computeSolunarPeriods()` — real moon-transit geometry per John Alden
  Knight's 1926 Solunar Theory (public domain — verified via research,
  distinct from the *proprietary* activity-scoring some commercial apps
  layer on top, which this app does not attempt to reproduce). "Major"
  periods center on the moon's real highest/lowest point that day (found
  by sampling `SunCalc.getMoonPosition`'s altitude every 10 minutes and
  picking the actual max/min — transit time genuinely shifts day to day
  with the moon's ~24h50m cycle, never assumed fixed). "Minor" periods
  center on the real moonrise/moonset times. The ±90min/±30min window
  widths are the theory's own commonly cited approximation; this app
  makes no feeding/activity claim, only reports the geometry.

## UI

`pages/TemporalPage.tsx` — GPS-or-map-center coordinate fallback (same
established pattern as `WeatherPage`), with previous/next-day navigation
(useful for planning a hunt a day or two out). Cards for sun times (with
real day length) and moon (phase name, illumination %, moonrise/moonset,
a real crescent/gibbous SVG rendering via `MoonPhaseIcon.tsx` — not a
generic icon, its shape is computed from the real `phase`/`waxing`
values), plus a solunar-periods list.

`components/DayTimelineBar.tsx` is the roadmap's "global 24h timeline"
requirement — a single horizontal bar spanning local midnight to
midnight: night/day shading from real sun times, amber bands for the
solunar periods, and a "now" marker (shown only when viewing today).
Every position on it comes from `utils/temporal.ts`'s `timeToPercent()`,
never hand-placed.

**Times are displayed in the browser's local timezone** (via
`toLocaleTimeString()`), not the target coordinate's — reasonable since,
unlike a general-purpose world clock, a hunter using this app is expected
to be physically at or near the location shown.
