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
  /** Fetched from the same batched grid call as wind (Open-Meteo's
   * `temperature_2m`/`precipitation`/`cloud_cover` — the same parameter
   * names already verified live in Phase 5's weather work), so switching
   * the map's active layer (wind/temperature/precipitation/clouds, see
   * `features/wind/state/windStore.ts`) never needs a second fetch. */
  temperatureCelsius: number
  precipitationMm: number
  cloudCoverPercent: number
}

/** The map layers the Windy-style layer switcher can render — see
 * `MapLibreProvider.ts`'s `createWindLayer()`. */
export type WeatherMapLayer = 'wind' | 'temperature' | 'precipitation' | 'clouds'

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
