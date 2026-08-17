import { OpenMeteoWeatherProvider } from './OpenMeteoWeatherProvider'
import type { WeatherProvider } from './WeatherProvider'

export type { WeatherProvider } from './WeatherProvider'

/** Always available — Open-Meteo needs no API key (unlike the Phase 1
 * map providers, which can be unconfigured). Features still handle a
 * failed fetch (network down, non-2xx response) via `weatherStore`. */
export const weatherProvider: WeatherProvider = new OpenMeteoWeatherProvider()
