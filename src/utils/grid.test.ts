import { describe, expect, it } from 'vitest'
import { buildGrid } from './grid'

describe('buildGrid', () => {
  const BOUNDS = { west: -71.3, south: 46.7, east: -71.1, north: 46.9 }

  it('returns gridSize x gridSize points', () => {
    expect(buildGrid(BOUNDS, 3)).toHaveLength(9)
    expect(buildGrid(BOUNDS, 5)).toHaveLength(25)
  })

  it('every point falls strictly within the bounds', () => {
    for (const point of buildGrid(BOUNDS, 4)) {
      expect(point.lat).toBeGreaterThan(BOUNDS.south)
      expect(point.lat).toBeLessThan(BOUNDS.north)
      expect(point.lng).toBeGreaterThan(BOUNDS.west)
      expect(point.lng).toBeLessThan(BOUNDS.east)
    }
  })

  it('is deterministic for the same inputs', () => {
    expect(buildGrid(BOUNDS, 3)).toEqual(buildGrid(BOUNDS, 3))
  })
})
