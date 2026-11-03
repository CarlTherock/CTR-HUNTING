import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WIND_STYLE,
  LINE_WIDTH,
  PARTICLE_COUNT,
  TRAIL_KEEP,
  parseWindStyle,
  staticFrameCount,
} from './windStyle'

describe('windStyle', () => {
  it('the defaults keep the historical rendering (0.9 fade, 1.8 px, 400 particles, 24 frames)', () => {
    expect(TRAIL_KEEP[DEFAULT_WIND_STYLE.size]).toBe(0.9)
    expect(LINE_WIDTH[DEFAULT_WIND_STYLE.thickness]).toBe(1.8)
    expect(PARTICLE_COUNT[DEFAULT_WIND_STYLE.density]).toBe(400)
    expect(staticFrameCount('normal')).toBe(24)
    expect(DEFAULT_WIND_STYLE.contrast).toBe(false)
  })

  it('a bigger size lengthens the trail without touching the particle count or width', () => {
    expect(TRAIL_KEEP.large).toBeGreaterThan(TRAIL_KEEP.normal)
    expect(TRAIL_KEEP.xlarge).toBeGreaterThan(TRAIL_KEEP.large)
    expect(staticFrameCount('xlarge')).toBeGreaterThan(staticFrameCount('large'))
    expect(staticFrameCount('large')).toBeGreaterThan(staticFrameCount('normal'))
    // Size, thickness and density are three independent tables.
    expect(PARTICLE_COUNT.low).toBeLessThan(PARTICLE_COUNT.normal)
    expect(PARTICLE_COUNT.normal).toBeLessThan(PARTICLE_COUNT.high)
  })

  it('every trail still fades inside the particle lifetime (100 frames)', () => {
    expect(staticFrameCount('xlarge')).toBeLessThan(100)
  })

  it('parses a stored value field by field, falling back on unknown content', () => {
    expect(
      parseWindStyle({
        size: 'xlarge',
        thickness: 'thick',
        density: 'high',
        contrast: true,
      }),
    ).toEqual({ size: 'xlarge', thickness: 'thick', density: 'high', contrast: true })
    expect(parseWindStyle({ size: 'huge', thickness: 3, contrast: 'yes' })).toEqual(
      DEFAULT_WIND_STYLE,
    )
    expect(parseWindStyle(null)).toEqual(DEFAULT_WIND_STYLE)
    expect(parseWindStyle({ size: 'large' })).toEqual({
      ...DEFAULT_WIND_STYLE,
      size: 'large',
    })
  })
})
