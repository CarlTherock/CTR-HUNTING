import { describe, expect, it } from 'vitest'
import { analysisHeatmapColor } from './analysisHeatmapColors'

describe('analysisHeatmapColor', () => {
  it('clamps below/above the scale ends', () => {
    expect(analysisHeatmapColor(-10)).toBe(analysisHeatmapColor(0))
    expect(analysisHeatmapColor(150)).toBe(analysisHeatmapColor(100))
  })

  it('interpolates smoothly between stops, not a flat step', () => {
    const low = analysisHeatmapColor(0, 1)
    const mid = analysisHeatmapColor(35, 1)
    const high = analysisHeatmapColor(75, 1)
    expect(low).not.toBe(mid)
    expect(mid).not.toBe(high)
  })

  it('respects the requested alpha', () => {
    expect(analysisHeatmapColor(50, 0.3)).toContain('0.3)')
  })
})
