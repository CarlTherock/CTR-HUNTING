/** Slope/aspect from four real elevation samples (N/S/E/W of a point) via
 * a standard central-difference gradient — the same basic method behind
 * most GIS slope/aspect tools (e.g. ArcGIS's Horn's-method-family
 * algorithms), simplified for a single 4-neighbor sample rather than a
 * full 3x3 kernel. This is a rough, real-time field estimate for a
 * hunting app, not a surveying-grade calculation — every input is a real
 * queried elevation, never fabricated, but the result should be treated
 * as `calculated`/estimated confidence, not measured. */
export interface SlopeAspect {
  /** Steepness, 0–90°. */
  slopeDegrees: number
  /** Compass direction the slope faces *downhill*, 0–360° (0 = north). */
  aspectDegrees: number
}

export function computeSlopeAspect(
  elevationNorth: number,
  elevationSouth: number,
  elevationEast: number,
  elevationWest: number,
  sampleSpacingMeters: number,
): SlopeAspect {
  const dzdx = (elevationEast - elevationWest) / (2 * sampleSpacingMeters)
  const dzdy = (elevationNorth - elevationSouth) / (2 * sampleSpacingMeters)

  const slopeDegrees = (Math.atan(Math.sqrt(dzdx ** 2 + dzdy ** 2)) * 180) / Math.PI

  // atan2(dzdx, dzdy) points toward the steepest *ascent* from north;
  // aspect conventionally reports the downhill direction, so flip it.
  let aspectDegrees = (Math.atan2(dzdx, dzdy) * 180) / Math.PI + 180
  aspectDegrees = ((aspectDegrees % 360) + 360) % 360

  return { slopeDegrees, aspectDegrees }
}

/** 16-point compass label for an aspect/bearing in degrees. */
export function compassLabel(degrees: number): string {
  const labels = [
    'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
  ]
  const index = Math.round(((degrees % 360) + 360) % 360 / 22.5) % 16
  return labels[index]
}
