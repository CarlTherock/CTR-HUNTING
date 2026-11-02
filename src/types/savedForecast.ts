import type { LngLatBounds } from '@/utils/tiles'
import type { Coordinate } from './geo'
import type { WindField } from './wind'

/**
 * « Télécharger pour ma sortie » — a forecast saved on the device (Dexie
 * table `savedForecasts`) so the Météo page and the wind analysis keep
 * working with no connection.
 *
 * Honesty rules baked into the types:
 *  - every measured quantity is `number | null`: `null` means « the provider
 *    gave nothing for this hour » and is NEVER shown as 0;
 *  - a saved forecast is a FORECAST (model output) fetched at `fetchedAt`, not
 *    a live measurement;
 *  - the wind grid (`windField`) is the very same `WindField` the map's wind
 *    analysis uses, so both screens read one source.
 */

/** Bump when the stored shape changes; readers must refuse unknown versions. */
export const SAVED_FORECAST_FORMAT_VERSION = 1

export type SavedForecastPlaceKind = 'gps' | 'map-center' | 'waypoint'

export interface SavedForecastPlace {
  kind: SavedForecastPlaceKind
  /** Shown to the user (« Ma position », « Centre de la carte », waypoint name). */
  name: string
  coordinate: Coordinate
  /** Set when `kind` is `waypoint`. */
  waypointId?: string
}

/** One hour of the point forecast, in the units of `SavedForecastUnits`. */
export interface PointHourly {
  /** Local wall-clock time of the place (`YYYY-MM-DDTHH:mm`), as delivered. */
  time: string
  temperatureCelsius: number | null
  apparentTemperatureCelsius: number | null
  /** WMO weather interpretation code. */
  weatherCode: number | null
  precipitationMm: number | null
  precipitationProbabilityPercent: number | null
  relativeHumidityPercent: number | null
  surfacePressureHpa: number | null
  cloudCoverPercent: number | null
  visibilityMeters: number | null
  uvIndex: number | null
  windSpeedKmh: number | null
  windGustsKmh: number | null
  /** Meteorological convention: where the wind comes FROM (0 = north). */
  windDirectionDegrees: number | null
  isDay: boolean | null
}

export interface PointDaily {
  /** Local date `YYYY-MM-DD`. */
  date: string
  weatherCode: number | null
  temperatureMaxCelsius: number | null
  temperatureMinCelsius: number | null
  apparentTemperatureMaxCelsius: number | null
  apparentTemperatureMinCelsius: number | null
  /** Local ISO time as given by the provider, `null` if absent (polar day/night). */
  sunrise: string | null
  sunset: string | null
  precipitationSumMm: number | null
  uvIndexMax: number | null
  windSpeedMaxKmh: number | null
  windGustsMaxKmh: number | null
  windDirectionDominantDegrees: number | null
}

export interface PointForecast {
  /** IANA name resolved by the provider (`timezone=auto`). */
  timezone: string
  hourly: PointHourly[]
  daily: PointDaily[]
}

export interface SavedForecastUnits {
  temperature: '°C'
  speed: 'km/h'
  precipitation: 'mm'
  pressure: 'hPa'
  visibility: 'm'
  direction: '°'
}

/** What is missing from a saved forecast, for an honest « partiel ». */
export type SavedForecastMissing = 'point' | 'wind-grid' | 'hours'

export interface SavedForecast {
  id: string
  formatVersion: number
  place: SavedForecastPlace
  provider: { name: 'Open-Meteo'; url: string }
  /** ISO 8601 UTC of the moment the data was retrieved. */
  fetchedAt: string
  /** Time zone of the place (IANA), from the provider. */
  timezone: string
  /** Calendar days asked from the provider (1 = today only). */
  requestedDays: number
  /** First and last hourly slot actually received (local `YYYY-MM-DDTHH:mm`). */
  validFrom: string | null
  validTo: string | null
  units: SavedForecastUnits
  /** `complete` only when the point forecast AND the wind grid arrived with
   * every requested hour; anything else is `partial` and says what is missing. */
  status: 'complete' | 'partial'
  missing: SavedForecastMissing[]
  point: PointForecast | null
  /** Real grid of wind samples around the place (same type as the live one). */
  windField: WindField | null
  /** Area the wind grid covers — a saved point is not a territory-wide field. */
  windBounds: LngLatBounds | null
  /** Rough size of the stored record, for the storage quota. */
  approxBytes: number
}
