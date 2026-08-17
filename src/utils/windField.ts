import { haversineMeters } from './geo'
import type { Coordinate, WindField, WindFieldSample, WindHourlyReading, WindReading } from '@/types'

const METERS_PER_DEGREE_LAT = 111_320

/** The real grid sample nearest `coordinate` — never interpolated
 * between samples or otherwise fabricated, always one genuine fetched
 * reading. `null` only when the field has no samples at all. */
export function nearestSample(field: WindField, coordinate: Coordinate): WindFieldSample | null {
  if (field.samples.length === 0) return null
  let best = field.samples[0]
  let bestDistance = haversineMeters(coordinate, best.coordinate)
  for (const sample of field.samples.slice(1)) {
    const distance = haversineMeters(coordinate, sample.coordinate)
    if (distance < bestDistance) {
      best = sample
      bestDistance = distance
    }
  }
  return best
}

/** The wind reading nearest `coordinate` at hourly index `hourOffset`
 * (0 = the first/soonest hourly sample) — `null` if there's no field or
 * that hour isn't in range, never a guessed fallback. */
export function windAt(
  field: WindField,
  coordinate: Coordinate,
  hourOffset: number,
): WindHourlyReading | null {
  return nearestSample(field, coordinate)?.hourly[hourOffset] ?? null
}

/**
 * Advances a geo position along the wind's flow (the direction the wind
 * blows *toward* — the opposite of `directionDegrees`'s meteorological
 * "from" convention), scaled by `speedScale` for visual legibility.
 *
 * This is a deliberately stylized animation, not a physically accurate
 * real-time simulation: at true real-world speed, a 15 km/h wind moves
 * ~4 m/s, imperceptible frame-to-frame on a map. Matches the project's
 * own design note ("flow field, not a physics engine — visually
 * sufficient, much lighter") — the *direction* and relative speed
 * differences are always real data; only the animation's time scale is
 * exaggerated for legibility.
 */
export function advancePosition(
  position: Coordinate,
  wind: WindReading,
  deltaSeconds: number,
  speedScale: number,
): Coordinate {
  const towardDegrees = (wind.directionDegrees + 180) % 360
  const towardRad = (towardDegrees * Math.PI) / 180
  const metersPerSecond = (wind.speedKmh * 1000) / 3600
  const distanceMeters = metersPerSecond * deltaSeconds * speedScale

  const dLat = (distanceMeters * Math.cos(towardRad)) / METERS_PER_DEGREE_LAT
  const dLng =
    (distanceMeters * Math.sin(towardRad)) /
    (METERS_PER_DEGREE_LAT * Math.cos((position.lat * Math.PI) / 180))

  return { lat: position.lat + dLat, lng: position.lng + dLng }
}

/** The 45°-wide compass octant (0=N, 45=NE, 90=E, …, 315=NW) containing
 * `degrees`. */
export function octantOf(degrees: number): number {
  const normalized = ((degrees % 360) + 360) % 360
  return (Math.round(normalized / 45) % 8) * 45
}

/** Whether `windDirectionDegrees` (the direction wind is blowing *from*)
 * falls within any of a waypoint's saved `optimalDirections` octants. An
 * empty/undefined preference list is "no preference set" — always
 * returns `false` (neither good nor bad), never assumed good. */
export function isOptimalWind(
  windDirectionDegrees: number,
  optimalDirections: number[] | undefined,
): boolean {
  if (!optimalDirections || optimalDirections.length === 0) return false
  return optimalDirections.includes(octantOf(windDirectionDegrees))
}
