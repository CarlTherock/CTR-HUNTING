export interface SunTimes {
  sunrise: string | null // ISO 8601
  sunset: string | null
  dawn: string | null // civil dawn
  dusk: string | null // civil dusk
  solarNoon: string
  goldenHourStart: string | null // evening golden hour start
  goldenHourEnd: string | null // morning golden hour end
  /** `null` when the sun never rises/sets that day (polar day/night) —
   * never a guessed value. */
  dayLengthMs: number | null
}

export interface MoonTimes {
  rise: string | null // ISO 8601, absent if no rise this calendar day
  set: string | null
  alwaysUp: boolean
  alwaysDown: boolean
}

export type MoonPhaseName =
  | 'New Moon'
  | 'Waxing Crescent'
  | 'First Quarter'
  | 'Waxing Gibbous'
  | 'Full Moon'
  | 'Waning Gibbous'
  | 'Last Quarter'
  | 'Waning Crescent'

export interface MoonIllumination {
  /** 0 (new) to 1 (full) — real illuminated fraction from SunCalc's lunar
   * position math, not a guess. */
  fraction: number
  /** 0 to 1 over the synodic month (0 = new, 0.5 = full). */
  phase: number
  waxing: boolean
  phaseName: MoonPhaseName
}

/**
 * A "major" (moon transit/anti-transit — directly overhead or underfoot)
 * or "minor" (near moonrise/moonset) solunar period, per John Alden
 * Knight's public-domain Solunar Theory geometry (1926) — computed here
 * from real moon-position math (SunCalc), not a commercial "activity
 * score." This app makes no claim about hunting/feeding activity, only
 * reports the underlying astronomical geometry the theory is based on.
 */
export interface SolunarPeriod {
  type: 'major' | 'minor'
  start: string // ISO 8601
  end: string
}

export interface TemporalData {
  date: string // ISO date (YYYY-MM-DD) this data is for
  sun: SunTimes
  moon: MoonTimes
  illumination: MoonIllumination
  solunarPeriods: SolunarPeriod[]
}
