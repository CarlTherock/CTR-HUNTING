import { compassLabel } from '@/utils/terrain'

/**
 * Scent zone of the wind dial, in the spirit of HuntStand's wind read.
 * Wind carries the hunter's scent in the direction it BLOWS TOWARD (the
 * arrow). The red zone is centred on the arrow tip and covers three of the
 * eight compass points (±45°: wind toward N → NW–N–NE) — the sector where
 * game can detect the hunter. A fixed-width cone that follows the real wind,
 * not a computed scent model: nothing about distance or odds.
 */
export const SCENT_ZONE_HALF_WIDTH = 45

/** Meteorological wind direction is where the wind comes FROM; the flow (the
 * arrow) points the opposite way: wind from the south flows north. */
export function windFlowDegrees(fromDegrees: number): number {
  return (((fromDegrees + 180) % 360) + 360) % 360
}

/** Red zone bounds (degrees, clockwise from N, `end > start`) around the flow. */
export function scentZone(fromDegrees: number): { start: number; end: number } {
  const flow = windFlowDegrees(fromDegrees)
  return { start: flow - SCENT_ZONE_HALF_WIDTH, end: flow + SCENT_ZONE_HALF_WIDTH }
}

/** The three compass points the zone covers, nearest-point snapped
 * (e.g. flow north → « NO–N–NE »), plus the point the scent heads toward. */
export function scentZoneLabels(fromDegrees: number): { toward: string; span: string } {
  const centre = Math.round(windFlowDegrees(fromDegrees) / 45) * 45
  const name = (deg: number) => compassLabel(deg)
  return {
    toward: name(centre),
    span: `${name(centre - 45)}–${name(centre)}–${name(centre + 45)}`,
  }
}
