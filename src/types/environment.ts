import type { DataPoint } from './data-quality'

/**
 * Shape for future weather/wind features (Phase 5-7). Defined now so
 * dependent modules can be typed against a stable contract, but no provider
 * is wired up yet — every field is a DataPoint so "no provider yet" and
 * "provider had no data" both render as `unavailable` rather than 0 or null.
 */
export interface WeatherSnapshot {
  timestamp: string // ISO 8601
  temperatureCelsius: DataPoint<number>
  humidityPercent: DataPoint<number>
  pressureHpa: DataPoint<number>
  precipitationMm: DataPoint<number>
  cloudCoverPercent: DataPoint<number>
  visibilityMeters: DataPoint<number>
}

export interface WindSnapshot {
  timestamp: string // ISO 8601
  speedKmh: DataPoint<number>
  gustKmh: DataPoint<number>
  directionDegrees: DataPoint<number>
}

export interface AstronomySnapshot {
  date: string // ISO 8601 date
  sunrise: DataPoint<string>
  sunset: DataPoint<string>
  moonrise: DataPoint<string>
  moonset: DataPoint<string>
  moonPhase: DataPoint<number> // 0 (new) .. 1 (full) .. back to 0
}
