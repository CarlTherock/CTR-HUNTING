import { describe, expect, it } from 'vitest'
import { compassLabel, computeSlopeAspect } from './terrain'

describe('computeSlopeAspect', () => {
  it('is flat (0° slope) when all four neighbors are the same elevation', () => {
    const { slopeDegrees } = computeSlopeAspect(100, 100, 100, 100, 15)
    expect(slopeDegrees).toBeCloseTo(0)
  })

  it('reports steeper slope for a bigger elevation difference over the same spacing', () => {
    const gentle = computeSlopeAspect(105, 95, 100, 100, 15)
    const steep = computeSlopeAspect(150, 50, 100, 100, 15)
    expect(steep.slopeDegrees).toBeGreaterThan(gentle.slopeDegrees)
  })

  it('faces south (aspect ~180°) when the terrain rises to the north (downhill is south)', () => {
    const { aspectDegrees } = computeSlopeAspect(110, 90, 100, 100, 15)
    expect(aspectDegrees).toBeCloseTo(180, 0)
  })

  it('faces west (aspect ~270°) when the terrain rises to the east (downhill is west)', () => {
    const { aspectDegrees } = computeSlopeAspect(100, 100, 110, 90, 15)
    expect(aspectDegrees).toBeCloseTo(270, 0)
  })

  it('always returns aspect within [0, 360)', () => {
    const { aspectDegrees } = computeSlopeAspect(90, 110, 90, 110, 15)
    expect(aspectDegrees).toBeGreaterThanOrEqual(0)
    expect(aspectDegrees).toBeLessThan(360)
  })
})

describe('compassLabel', () => {
  it('labels the 4 cardinal and 4 ordinal directions correctly', () => {
    expect(compassLabel(0)).toBe('N')
    expect(compassLabel(90)).toBe('E')
    expect(compassLabel(180)).toBe('S')
    expect(compassLabel(270)).toBe('W')
    expect(compassLabel(45)).toBe('NE')
    expect(compassLabel(135)).toBe('SE')
  })

  it('wraps correctly near 360°', () => {
    expect(compassLabel(359)).toBe('N')
    expect(compassLabel(-1)).toBe('N')
  })
})
