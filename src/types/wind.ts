import type { Coordinate } from './geo'

/** Meteorological convention throughout: `directionDegrees` is the
 * direction the wind is blowing **from** (0 = from the north), not the
 * direction it's heading toward — confirmed against Open-Meteo's live
 * docs (`wind_direction_10m`), matching standard weather-reporting
 * convention. */
export interface WindReading {
  directionDegrees: number
  speedKmh: number
  gustsKmh: number
}

export interface WindHourlyReading extends WindReading {
  time: string // ISO 8601
}

/** One real sampled grid point — never a fabricated/interpolated value,
 * always a genuine Open-Meteo reading for that exact coordinate. */
export interface WindFieldSample {
  coordinate: Coordinate
  hourly: WindHourlyReading[]
}

/** A grid of real wind samples covering a map area — the basis for the
 * animated flow-field visualization (Phase 6) and for comparing a
 * waypoint's saved "optimal wind" against the nearest real reading. */
export interface WindField {
  timezone: string
  samples: WindFieldSample[]
}
