/**
 * Real-world units throughout (°C, km/h, hPa, mm, m) — Open-Meteo's
 * defaults (`src/services/weather/OpenMeteoWeatherProvider.ts`), not
 * arbitrarily picked. `visibilityMeters` can be `null`: Open-Meteo's
 * `current=` block doesn't include visibility natively (verified against
 * their live docs), so it's sourced from the first hourly sample —
 * `null` only if even that isn't available, never guessed.
 */
export interface WeatherConditions {
  timestamp: string // ISO 8601
  temperatureCelsius: number
  relativeHumidityPercent: number
  surfacePressureHpa: number
  precipitationMm: number
  cloudCoverPercent: number
  windSpeedKmh: number
  windGustsKmh: number
  visibilityMeters: number | null
}

export interface HourlyForecastEntry {
  time: string // ISO 8601
  temperatureCelsius: number
  relativeHumidityPercent: number
  surfacePressureHpa: number
  precipitationMm: number
  cloudCoverPercent: number
  windSpeedKmh: number
  windGustsKmh: number
  visibilityMeters: number
}

export interface WeatherForecast {
  /** IANA timezone name (`timezone=auto` in the request) — used to
   * display hourly times in the location's own local time, not the
   * device's. */
  timezone: string
  current: WeatherConditions
  hourly: HourlyForecastEntry[]
}
