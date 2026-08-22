import type { Coordinate, VegetationSample } from '@/types'
import type { LngLatBounds } from '@/utils/tiles'

export interface VegetationProvider {
  /** Real land-cover tags within `radiusMeters` of `coordinate`, or
   * `null` if the provider has no data for that area — never a
   * fabricated/guessed classification. */
  fetchVegetation(coordinate: Coordinate, radiusMeters: number): Promise<VegetationSample | null>
  /** One real sample per `buildGrid(bounds, gridSize)` point, from a
   * single batched query over the whole area (never one request per
   * point) — a grid point with nothing nearby gets an empty
   * `categoryCounts`, never a fabricated one. */
  fetchVegetationGrid(bounds: LngLatBounds, gridSize: number): Promise<VegetationSample[]>
}
