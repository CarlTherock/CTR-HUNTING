import type { Coordinate, WeatherForecast } from '@/types'

/**
 * Adapter contract for the weather engine — features depend only on this
 * interface, never a concrete provider class, so the provider stays
 * replaceable (per the project's "external providers must be behind an
 * adapter" hard rule).
 */
export interface WeatherProvider {
  /** Throws on a network/HTTP failure — callers (see `weatherStore.ts`)
   * are responsible for catching and falling back to any cached reading,
   * never silently defaulting to a fabricated value. */
  fetchForecast(coordinate: Coordinate): Promise<WeatherForecast>
}
