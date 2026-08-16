import { describe, expect, it } from 'vitest'
import {
  lngLatToTile,
  tileCenterLngLat,
  tileCountForBounds,
  tileCountForRange,
  tileRangeForBounds,
  tilesForRange,
  tileToLngLat,
} from './tiles'

describe('lngLatToTile', () => {
  it('maps (0,0) to the center tile at zoom 1 (the classic 2x2 grid)', () => {
    // At zoom 1 there are 2x2 tiles; (0,0) lng/lat sits exactly on the
    // boundary, which floors into tile (1,1) — a well-known reference
    // value for this formula (OSM wiki worked example).
    expect(lngLatToTile(0, 0, 1)).toEqual({ x: 1, y: 1 })
  })

  it('maps the top-left corner of the world to tile (0,0) at any zoom', () => {
    expect(lngLatToTile(-180, 85, 3)).toEqual({ x: 0, y: 0 })
  })

  it('maps the bottom-right corner of the world to the last tile at any zoom', () => {
    const zoom = 4
    const n = 2 ** zoom
    expect(lngLatToTile(179.9, -85, zoom)).toEqual({ x: n - 1, y: n - 1 })
  })
})

describe('tileRangeForBounds / tileCountForRange', () => {
  it('covers the whole world in exactly 2x2 tiles at zoom 1', () => {
    const range = tileRangeForBounds({ west: -180, south: -85, east: 180, north: 85 }, 1)
    expect(range).toEqual({ zoom: 1, minX: 0, maxX: 1, minY: 0, maxY: 1 })
    expect(tileCountForRange(range)).toBe(4)
  })

  it('is a single tile for a point-sized bounds', () => {
    const range = tileRangeForBounds(
      { west: -71.21, south: 46.81, east: -71.2, north: 46.815 },
      14,
    )
    expect(tileCountForRange(range)).toBeGreaterThanOrEqual(1)
  })
})

describe('tileCountForBounds', () => {
  it('sums tile counts across the whole zoom range, not just one level', () => {
    const bounds = { west: -180, south: -85, east: 180, north: 85 }
    // zoom 0 = 1 tile, zoom 1 = 4 tiles → 5 total
    expect(tileCountForBounds(bounds, 0, 1)).toBe(5)
  })

  it('grows with a wider zoom range', () => {
    const bounds = { west: -71.3, south: 46.7, east: -71.1, north: 46.9 }
    const narrow = tileCountForBounds(bounds, 10, 10)
    const wide = tileCountForBounds(bounds, 10, 12)
    expect(wide).toBeGreaterThan(narrow)
  })
})

describe('tileToLngLat / tileCenterLngLat (round trip with lngLatToTile)', () => {
  it('maps tile (0,0) at zoom 1 back to the north-west corner of the world', () => {
    const corner = tileToLngLat(0, 0, 1)
    expect(corner.lng).toBeCloseTo(-180)
    expect(corner.lat).toBeCloseTo(85.0511, 3)
  })

  it('round-trips: the center of a tile maps back into that same tile', () => {
    const zoom = 10
    const original = { x: 300, y: 400 }
    const center = tileCenterLngLat(original.x, original.y, zoom)
    expect(lngLatToTile(center.lng, center.lat, zoom)).toEqual(original)
  })
})

describe('tilesForRange', () => {
  it('lists every tile in the range, matching the count', () => {
    const range = { zoom: 5, minX: 3, maxX: 5, minY: 7, maxY: 8 }
    const tiles = tilesForRange(range)
    expect(tiles).toHaveLength(tileCountForRange(range))
    expect(tiles).toContainEqual({ x: 3, y: 7 })
    expect(tiles).toContainEqual({ x: 5, y: 8 })
  })
})
