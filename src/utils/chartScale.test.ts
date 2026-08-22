import { describe, expect, it } from 'vitest'
import { buildLinePath, scaleLinear } from './chartScale'

describe('scaleLinear', () => {
  it('maps domain endpoints to range endpoints', () => {
    const scale = scaleLinear(0, 100, 0, 200)
    expect(scale(0)).toBe(0)
    expect(scale(100)).toBe(200)
    expect(scale(50)).toBe(100)
  })

  it('clamps values outside the domain to the range edges', () => {
    const scale = scaleLinear(0, 10, 0, 100)
    expect(scale(-5)).toBe(0)
    expect(scale(15)).toBe(100)
  })

  it('handles a zero-width domain without dividing by zero', () => {
    const scale = scaleLinear(5, 5, 0, 100)
    expect(scale(5)).toBe(50)
  })
})

describe('buildLinePath', () => {
  it('returns null for fewer than 2 points', () => {
    expect(buildLinePath([])).toBeNull()
    expect(buildLinePath([{ x: 0, y: 0 }])).toBeNull()
  })

  it('builds a real SVG path string through the given points', () => {
    const path = buildLinePath([
      { x: 0, y: 10 },
      { x: 5, y: 20 },
    ])
    expect(path).toBe('M 0.0 10.0 L 5.0 20.0')
  })
})
