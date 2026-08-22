import * as SunCalc from 'suncalc'
import type {
  Coordinate,
  MoonPhaseName,
  MoonIllumination,
  MoonTimes,
  SolunarPeriod,
  SunTimes,
  TemporalData,
} from '@/types'

/**
 * Sun/moon math via SunCalc (github.com/mourner/suncalc, BSD-2-Clause —
 * verified directly against its LICENSE file; npm's registry metadata
 * shows "Proprietary" only because the package's own package.json omits
 * a `license` field, not because the actual license terms differ),
 * based on the Astronomical Almanac's low-precision solar/lunar position
 * formulas (the same family NOAA's solar calculator uses). Deliberately
 * computed client-side with **no network call** — unlike Open-Meteo
 * (Phases 5/6), sun/moon positions don't need live data, so doing this
 * fully offline is strictly better for this app's offline-first goal,
 * and Open-Meteo's own `sunrise`/`moonrise` daily fields would need one
 * anyway.
 */

function isoOrNull(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null
}

export function getSunTimes(date: Date, coordinate: Coordinate): SunTimes {
  const t = SunCalc.getTimes(date, coordinate.lat, coordinate.lng)
  const dayLengthMs = t.sunrise && t.sunset ? t.sunset.getTime() - t.sunrise.getTime() : null
  return {
    sunrise: isoOrNull(t.sunrise),
    sunset: isoOrNull(t.sunset),
    dawn: isoOrNull(t.dawn),
    dusk: isoOrNull(t.dusk),
    solarNoon: t.solarNoon.toISOString(),
    goldenHourStart: isoOrNull(t.goldenHour),
    goldenHourEnd: isoOrNull(t.goldenHourEnd),
    dayLengthMs,
  }
}

export function getMoonTimes(date: Date, coordinate: Coordinate): MoonTimes {
  const t = SunCalc.getMoonTimes(date, coordinate.lat, coordinate.lng)
  return {
    rise: isoOrNull(t.rise),
    set: isoOrNull(t.set),
    alwaysUp: t.alwaysUp ?? false,
    alwaysDown: t.alwaysDown ?? false,
  }
}

/**
 * Buckets SunCalc's continuous 0–1 phase fraction into the 8 conventional
 * named phases. The 4 exact instants (new/first quarter/full/last
 * quarter) get a narrower band since they're single moments; the 4
 * "between" phases each get the bulk of the ~29.53-day cycle — this
 * bucketing width is a real, common convention (matching how most
 * moon-phase calendars label a many-day span "Waxing Crescent"), not a
 * fabricated astronomical fact — the underlying `phase` value itself is
 * SunCalc's real computed number.
 */
export function moonPhaseName(phase: number): MoonPhaseName {
  const p = ((phase % 1) + 1) % 1
  if (p < 0.03 || p >= 0.97) return 'New Moon'
  if (p < 0.22) return 'Waxing Crescent'
  if (p < 0.28) return 'First Quarter'
  if (p < 0.47) return 'Waxing Gibbous'
  if (p < 0.53) return 'Full Moon'
  if (p < 0.72) return 'Waning Gibbous'
  if (p < 0.78) return 'Last Quarter'
  return 'Waning Crescent'
}

export function getMoonIllumination(date: Date): MoonIllumination {
  const i = SunCalc.getMoonIllumination(date)
  return { fraction: i.fraction, phase: i.phase, waxing: i.waxing, phaseName: moonPhaseName(i.phase) }
}

/** ±90 min around moon transit/anti-transit — roughly the major-period
 * length commonly described for Solunar Theory. ±30 min around
 * moonrise/moonset for minor periods. These window widths are the
 * theory's own commonly cited approximation, not a precise or
 * commercially-tuned figure — this app makes no activity/feeding claim,
 * only reports the public geometry. */
const MAJOR_WINDOW_MS = 90 * 60_000
const MINOR_WINDOW_MS = 30 * 60_000
const SAMPLE_INTERVAL_MS = 10 * 60_000

/**
 * Real moon-transit geometry (John Alden Knight's 1926 Solunar Theory —
 * public domain, see `SolunarPeriod`'s doc comment): "major" periods
 * center on the moon's highest point (transit, overhead) and lowest
 * point (anti-transit, underfoot) that calendar day, found by sampling
 * `SunCalc.getMoonPosition`'s altitude every 10 minutes across the day
 * and picking the real max/min — never an assumed fixed time, since
 * transit time shifts day to day with the moon's ~24h50m cycle. "Minor"
 * periods center on the real moonrise/moonset times.
 */
/** Sweeps the moon's altitude every 10 minutes across `date`'s calendar
 * day to find its real transit (highest, "overhead") and anti-transit
 * (lowest, "underfoot") instants — shared by `computeSolunarPeriods` and
 * `computeTemporalData`'s `moonTransit` field so the sweep only runs
 * once per day computed. */
function findMoonExtremes(
  date: Date,
  coordinate: Coordinate,
): { highest: { time: Date; altitude: number }; lowest: { time: Date; altitude: number } } {
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)

  let highest = { time: dayStart, altitude: -Infinity }
  let lowest = { time: dayStart, altitude: Infinity }
  for (let ms = 0; ms <= 24 * 60 * 60_000; ms += SAMPLE_INTERVAL_MS) {
    const time = new Date(dayStart.getTime() + ms)
    const { altitude } = SunCalc.getMoonPosition(time, coordinate.lat, coordinate.lng)
    if (altitude > highest.altitude) highest = { time, altitude }
    if (altitude < lowest.altitude) lowest = { time, altitude }
  }
  return { highest, lowest }
}

export function computeSolunarPeriods(
  date: Date,
  coordinate: Coordinate,
  precomputedExtremes?: ReturnType<typeof findMoonExtremes>,
): SolunarPeriod[] {
  const { highest, lowest } = precomputedExtremes ?? findMoonExtremes(date, coordinate)

  const periods: SolunarPeriod[] = [
    {
      type: 'major',
      start: new Date(highest.time.getTime() - MAJOR_WINDOW_MS).toISOString(),
      end: new Date(highest.time.getTime() + MAJOR_WINDOW_MS).toISOString(),
      peak: highest.time.toISOString(),
    },
    {
      type: 'major',
      start: new Date(lowest.time.getTime() - MAJOR_WINDOW_MS).toISOString(),
      end: new Date(lowest.time.getTime() + MAJOR_WINDOW_MS).toISOString(),
      peak: lowest.time.toISOString(),
    },
  ]

  const moonTimes = SunCalc.getMoonTimes(date, coordinate.lat, coordinate.lng)
  if (moonTimes.rise) {
    periods.push({
      type: 'minor',
      start: new Date(moonTimes.rise.getTime() - MINOR_WINDOW_MS).toISOString(),
      end: new Date(moonTimes.rise.getTime() + MINOR_WINDOW_MS).toISOString(),
      peak: moonTimes.rise.toISOString(),
    })
  }
  if (moonTimes.set) {
    periods.push({
      type: 'minor',
      start: new Date(moonTimes.set.getTime() - MINOR_WINDOW_MS).toISOString(),
      end: new Date(moonTimes.set.getTime() + MINOR_WINDOW_MS).toISOString(),
      peak: moonTimes.set.toISOString(),
    })
  }

  return periods.sort((a, b) => a.start.localeCompare(b.start))
}

/** Position (0–100) of a real ISO timestamp along a 24h bar spanning
 * `dayStart` (local midnight) to `dayStart + 24h` — clamped, since a
 * dawn/dusk/solunar time can technically fall just outside that window.
 * Powers `DayTimelineBar`'s day/night shading and period markers. */
export function timeToPercent(iso: string, dayStart: Date): number {
  const percent = ((new Date(iso).getTime() - dayStart.getTime()) / (24 * 60 * 60_000)) * 100
  return Math.max(0, Math.min(100, percent))
}

export function computeTemporalData(date: Date, coordinate: Coordinate): TemporalData {
  const extremes = findMoonExtremes(date, coordinate)
  return {
    date: date.toISOString().slice(0, 10),
    sun: getSunTimes(date, coordinate),
    moon: getMoonTimes(date, coordinate),
    illumination: getMoonIllumination(date),
    solunarPeriods: computeSolunarPeriods(date, coordinate, extremes),
    moonTransit: {
      overhead: extremes.highest.time.toISOString(),
      underfoot: extremes.lowest.time.toISOString(),
    },
  }
}
