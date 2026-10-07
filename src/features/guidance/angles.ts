import type { Coordinate } from '@/types'

/**
 * Angle maths for "Aller à". All angles are in degrees. Bearings are measured
 * clockwise from TRUE north (0 = north, 90 = east).
 */

/** Maps any finite angle to [0, 360). Non-finite input stays `NaN`: callers
 * decide what "no angle" means, nothing is invented here. */
export function normalizeDegrees(degrees: number): number {
  if (!Number.isFinite(degrees)) return Number.NaN
  const result = ((degrees % 360) + 360) % 360
  // `-1e-15 % 360 + 360` can round to exactly 360.
  return result >= 360 ? 0 : result
}

/** Signed shortest rotation from `from` to `to`, in (-180, 180]. Positive =
 * clockwise. 180 degrees apart is reported as +180 (never -180). */
export function shortestAngleDelta(from: number, to: number): number {
  const delta = normalizeDegrees(to - from)
  return delta > 180 ? delta - 360 : delta
}

/** Where the target is relative to where the phone points, in (-180, 180]:
 * 0 = straight ahead, +90 = to the right, -90 = to the left, 180 = behind.
 * `bearingTrue` and `headingTrue` must BOTH be relative to true north. */
export function relativeAngle(bearingTrue: number, headingTrue: number): number {
  return shortestAngleDelta(headingTrue, bearingTrue)
}

/**
 * Keeps a displayed rotation continuous. `previousDisplayAngle` is the
 * (unbounded) angle currently shown; the result is the angle equivalent to
 * `nextAngle` that is closest to it, so a CSS transition turns the short way
 * (359 -> 0 becomes 359 -> 360, never a 359-degree spin back). With no
 * previous angle the next one is used as is.
 */
export function unwrapAngle(
  previousDisplayAngle: number | null,
  nextAngle: number,
): number {
  if (previousDisplayAngle === null || !Number.isFinite(previousDisplayAngle)) {
    return nextAngle
  }
  return previousDisplayAngle + shortestAngleDelta(previousDisplayAngle, nextAngle)
}

function isUsable(coordinate: Pick<Coordinate, 'lat' | 'lng'>): boolean {
  return (
    Number.isFinite(coordinate.lat) &&
    Number.isFinite(coordinate.lng) &&
    Math.abs(coordinate.lat) <= 90 &&
    Math.abs(coordinate.lng) <= 180
  )
}

/**
 * Initial great-circle bearing from `from` to `to`, in [0, 360) clockwise from
 * TRUE north (not magnetic). `null` when it is undefined: an unusable
 * coordinate, or the two points coincide (distance zero has no direction).
 * Works across the antimeridian. At a pole the bearing is measured along the
 * meridian of `from.lng` (every direction from the north pole is south).
 */
export function initialBearingDegrees(
  from: Pick<Coordinate, 'lat' | 'lng'>,
  to: Pick<Coordinate, 'lat' | 'lng'>,
): number | null {
  if (!isUsable(from) || !isUsable(to)) return null
  const toRad = Math.PI / 180
  const phi1 = from.lat * toRad
  const phi2 = to.lat * toRad
  const dLambda = (to.lng - from.lng) * toRad
  const y = Math.sin(dLambda) * Math.cos(phi2)
  const x =
    Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda)
  if (Math.hypot(x, y) < 1e-12) return null
  return normalizeDegrees((Math.atan2(y, x) * 180) / Math.PI)
}
