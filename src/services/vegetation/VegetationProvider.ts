import type { Coordinate, VegetationSample } from '@/types'

export interface VegetationProvider {
  /** Real land-cover tags within `radiusMeters` of `coordinate`, or
   * `null` if the provider has no data for that area — never a
   * fabricated/guessed classification. */
  fetchVegetation(coordinate: Coordinate, radiusMeters: number): Promise<VegetationSample | null>
}
