import { describe, expect, it } from 'vitest'
import { pointOnCircle, wedgePath } from './polarGeometry'

describe('pointOnCircle', () => {
  it('places 0° (north) directly above the center', () => {
    const p = pointOnCircle(50, 50, 40, 0)
    expect(p.x).toBeCloseTo(50)
    expect(p.y).toBeCloseTo(10)
  })

  it('places 90° (east) directly to the right of the center', () => {
    const p = pointOnCircle(50, 50, 40, 90)
    expect(p.x).toBeCloseTo(90)
    expect(p.y).toBeCloseTo(50)
  })

  it('places 180° (south) directly below the center', () => {
    const p = pointOnCircle(50, 50, 40, 180)
    expect(p.x).toBeCloseTo(50)
    expect(p.y).toBeCloseTo(90)
  })
})

describe('wedgePath', () => {
  it('produces a real SVG path starting and ending at the center', () => {
    const path = wedgePath(50, 50, 40, 0, 45)
    expect(path).toMatch(/^M 50 50 L/)
    expect(path.trim().endsWith('Z')).toBe(true)
  })

  it('uses the large-arc flag only when the wedge spans more than 180°', () => {
    const small = wedgePath(50, 50, 40, 0, 45)
    const large = wedgePath(50, 50, 40, 0, 270)
    expect(small).toContain(' 0 1 ')
    expect(large).toContain(' 1 1 ')
  })
})
