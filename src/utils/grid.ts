import type { Coordinate } from '@/types'
import type { LngLatBounds } from './tiles'

/** Evenly spaced `gridSize` × `gridSize` cell-center points covering
 * `bounds` — shared by every feature that samples a real value across a
 * map area in one batched request rather than fetching one point at a
 * time (wind, Phase 6; the analysis heatmap, Phase 9), so they all
 * define "the grid" the same way. */
export function buildGrid(bounds: LngLatBounds, gridSize: number): Coordinate[] {
  const points: Coordinate[] = []
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const lat = bounds.south + ((bounds.north - bounds.south) * (row + 0.5)) / gridSize
      const lng = bounds.west + ((bounds.east - bounds.west) * (col + 0.5)) / gridSize
      points.push({ lat, lng })
    }
  }
  return points
}
