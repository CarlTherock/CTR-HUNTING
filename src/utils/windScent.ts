/**
 * Scent danger zone of the wind dial, as on HuntStand's wind read: the
 * sector NW–N–NE (315° → 45°). Wind carries the hunter's scent in the
 * direction it BLOWS TOWARD; when that heading falls inside the red sector
 * the scent reaches game expected there. A fixed sector, not a computed
 * scent model — the dial says only that, nothing about distance or odds.
 */
export const SCENT_DANGER_ZONE = { from: 315, to: 45 } as const

/** Meteorological wind direction is where the wind comes FROM; the flow (the
 * arrow) points the opposite way: wind from the south flows north. */
export function windFlowDegrees(fromDegrees: number): number {
  return (((fromDegrees + 180) % 360) + 360) % 360
}

/** The flow heads into the red NW–N–NE sector. */
export function isScentDanger(fromDegrees: number): boolean {
  const flow = windFlowDegrees(fromDegrees)
  return flow >= SCENT_DANGER_ZONE.from || flow <= SCENT_DANGER_ZONE.to
}
