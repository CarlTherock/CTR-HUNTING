import type { Coordinate } from './geo'

/** A hunting-relevant land-cover bucket, mapped from real OpenStreetMap
 * tag values (`landuse=*`/`natural=*`/`leisure=park` — public, documented
 * OSM wiki values, not invented) — never a fabricated classification. */
export type VegetationCategory =
  | 'forest'
  | 'wetland'
  | 'agricultural'
  | 'grassland'
  | 'water'
  | 'developed'
  | 'other'

export interface VegetationSample {
  coordinate: Coordinate
  radiusMeters: number
  /** Real tag counts within the query radius — never interpolated or
   * estimated beyond what OpenStreetMap actually has mapped there. */
  categoryCounts: Partial<Record<VegetationCategory, number>>
  source: 'openstreetmap'
}
