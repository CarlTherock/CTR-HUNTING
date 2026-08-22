import { describe, expect, it } from 'vitest'
import { buildCanvasFilter, DEFAULT_ADJUSTMENTS } from './imageAdjustments'

describe('buildCanvasFilter', () => {
  it('produces an unchanged filter string for the defaults', () => {
    expect(buildCanvasFilter(DEFAULT_ADJUSTMENTS)).toBe('brightness(100%) contrast(100%)')
  })

  it('reflects real brightness/contrast values', () => {
    const filter = buildCanvasFilter({ brightnessPercent: 120, contrastPercent: 90, filter: 'none' })
    expect(filter).toBe('brightness(120%) contrast(90%)')
  })

  it('appends the real CSS function for each named preset', () => {
    expect(buildCanvasFilter({ ...DEFAULT_ADJUSTMENTS, filter: 'grayscale' })).toContain('grayscale(100%)')
    expect(buildCanvasFilter({ ...DEFAULT_ADJUSTMENTS, filter: 'sepia' })).toContain('sepia(100%)')
    expect(buildCanvasFilter({ ...DEFAULT_ADJUSTMENTS, filter: 'vivid' })).toContain('saturate(180%)')
  })

  it('adds no extra function for "none"', () => {
    expect(buildCanvasFilter(DEFAULT_ADJUSTMENTS).split(' ')).toHaveLength(2)
  })
})
