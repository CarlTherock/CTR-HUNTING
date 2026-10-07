import { haversineMeters } from './geo'
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

export interface CellSizeMeters {
  widthMeters: number
  heightMeters: number
}

/** Taille réelle (m) d'une cellule de la grille `gridSize × gridSize` qui
 * couvre `bounds` : sert à DIRE la résolution de la carte de potentiel
 * (elle dépend de l'emprise visible, donc du zoom). */
export function cellSizeMeters(bounds: LngLatBounds, gridSize: number): CellSizeMeters {
  const midLat = (bounds.north + bounds.south) / 2
  const midLng = (bounds.east + bounds.west) / 2
  return {
    widthMeters:
      haversineMeters(
        { lat: midLat, lng: bounds.west },
        { lat: midLat, lng: bounds.east },
      ) / gridSize,
    heightMeters:
      haversineMeters(
        { lat: bounds.south, lng: midLng },
        { lat: bounds.north, lng: midLng },
      ) / gridSize,
  }
}

/** Rectangle géographique de la cellule d'index `index` (même ordre que
 * `buildGrid` : rangées du sud vers le nord). */
export function cellBoundsAt(
  bounds: LngLatBounds,
  gridSize: number,
  index: number,
): LngLatBounds {
  const row = Math.floor(index / gridSize)
  const col = index % gridSize
  const dLat = (bounds.north - bounds.south) / gridSize
  const dLng = (bounds.east - bounds.west) / gridSize
  return {
    south: bounds.south + row * dLat,
    north: bounds.south + (row + 1) * dLat,
    west: bounds.west + col * dLng,
    east: bounds.west + (col + 1) * dLng,
  }
}

/** Index de la cellule contenant `coordinate`, ou `null` hors de la zone
 * analysée. */
export function cellIndexAt(
  bounds: LngLatBounds,
  gridSize: number,
  coordinate: Coordinate,
): number | null {
  if (
    coordinate.lat < bounds.south ||
    coordinate.lat > bounds.north ||
    coordinate.lng < bounds.west ||
    coordinate.lng > bounds.east
  ) {
    return null
  }
  const row = Math.min(
    gridSize - 1,
    Math.floor(
      ((coordinate.lat - bounds.south) / (bounds.north - bounds.south)) * gridSize,
    ),
  )
  const col = Math.min(
    gridSize - 1,
    Math.floor(((coordinate.lng - bounds.west) / (bounds.east - bounds.west)) * gridSize),
  )
  return row * gridSize + col
}

/** Formate une distance de cellule : « 850 m » ou « 1,9 km ». */
export function formatCellMeters(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`
}
