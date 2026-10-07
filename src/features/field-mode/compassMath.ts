/**
 * Pure maths behind `useCompassHeading`. Heading semantics used throughout:
 *
 *  - MAGNETIC heading: clockwise angle from MAGNETIC north (what a compass
 *    sensor measures). `webkitCompassHeading` and the `alpha` of an absolute
 *    `deviceorientation` event are both magnetic.
 *  - TRUE heading: clockwise angle from TRUE (geographic) north =
 *    magnetic + declination (declination is positive towards the east).
 *    Bearings between coordinates are TRUE; only a true heading may be
 *    compared with them.
 *  - GPS course (`GeolocationCoordinates.heading`) is the direction of TRAVEL
 *    over the ground, not where the phone points: it is not a compass.
 */

const DEG = Math.PI / 180

export function normalizeHeading(degrees: number): number {
  return (((degrees % 360) + 360) % 360) % 360
}

/** Smallest absolute difference between two headings, in [0, 180]. */
export function headingDifference(a: number, b: number): number {
  const d = Math.abs(normalizeHeading(a) - normalizeHeading(b))
  return d > 180 ? 360 - d : d
}

/**
 * Magnetic heading of the direction the user faces, from an absolute
 * `deviceorientation` triple (W3C Device Orientation, Z-X'-Y'' Euler angles,
 * `alpha` counter-clockwise from magnetic north).
 *
 * - Phone held upright (camera pointing at the horizon): the W3C reference
 *   `compassHeading` formula, i.e. the horizontal direction of the REAR of
 *   the device. It does not depend on the screen orientation.
 * - Phone held (nearly) flat: the rear points at the ground, so the formula
 *   degenerates; the direction of the TOP edge of the device is used instead
 *   (`360 - alpha` when perfectly flat), then rotated by the screen
 *   orientation angle so that "forward" is the top of the screen the user
 *   reads. The rear/top choice follows whichever has the larger horizontal
 *   component.
 *
 * `beta`/`gamma` that are absent count as 0 (flat); `alpha` is required.
 * Returns `null` when the inputs are not finite numbers.
 */
export function compassHeading(
  alpha: number,
  beta: number | null | undefined,
  gamma: number | null | undefined,
  screenAngleDegrees = 0,
): number | null {
  if (!Number.isFinite(alpha)) return null
  const x = Number.isFinite(beta as number) ? (beta as number) * DEG : 0
  const y = Number.isFinite(gamma as number) ? (gamma as number) * DEG : 0
  const z = alpha * DEG
  const cX = Math.cos(x)
  const sX = Math.sin(x)
  const cY = Math.cos(y)
  const sY = Math.sin(y)
  const cZ = Math.cos(z)
  const sZ = Math.sin(z)

  // Horizontal components (east, north) of the rear direction (W3C formula).
  const rearEast = -cZ * sY - sZ * sX * cY
  const rearNorth = -sZ * sY + cZ * sX * cY
  // Horizontal components of the top edge of the device.
  const topEast = -sZ * cX
  const topNorth = cZ * cX

  if (Math.hypot(rearEast, rearNorth) >= Math.hypot(topEast, topNorth)) {
    return normalizeHeading(Math.atan2(rearEast, rearNorth) / DEG)
  }
  return normalizeHeading(Math.atan2(topEast, topNorth) / DEG + screenAngleDegrees)
}

/** Current screen rotation in degrees (0, 90, 180, 270), from the Screen
 * Orientation API or, on older iOS, the legacy `window.orientation`. 0 when
 * neither is available. */
export function currentScreenAngle(): number {
  if (typeof window === 'undefined') return 0
  const modern = window.screen?.orientation?.angle
  if (typeof modern === 'number' && Number.isFinite(modern)) {
    return normalizeHeading(modern)
  }
  const legacy = (window as unknown as { orientation?: number }).orientation
  if (typeof legacy === 'number' && Number.isFinite(legacy)) {
    return normalizeHeading(legacy)
  }
  return 0
}
