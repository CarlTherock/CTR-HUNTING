import { describe, expect, it } from 'vitest'
import type { WeatherMapFrame } from '@/types'
import { describeSegments, frameProduct, productSegments } from './frameProduct'

const NOW = new Date(2026, 10, 5, 5, 0)
const at = (h: number, m: number) => new Date(2026, 10, 5, h, m).toISOString()
const frames: WeatherMapFrame[] = [
  { time: at(5, 0), kind: 'observed' },
  { time: at(5, 12), kind: 'forecast', extrapolated: true },
  { time: at(5, 24), kind: 'forecast', extrapolated: true },
  { time: at(7, 0), kind: 'forecast', modelForecast: true },
  { time: at(8, 0), kind: 'forecast', modelForecast: true },
]

describe('frameProduct', () => {
  it('tells the three radar products apart, from the frames themselves', () => {
    expect(frames.map(frameProduct)).toEqual([
      'observed',
      'extrapolated',
      'extrapolated',
      'model',
      'model',
    ])
    expect(frameProduct({ time: at(5, 0), kind: 'forecast' })).toBe('forecast')
  })

  it('segments follow the available frames (no fixed duration) and expose the transition', () => {
    expect(productSegments(frames)).toEqual([
      { product: 'observed', from: 0, to: 0 },
      { product: 'extrapolated', from: 1, to: 2 },
      { product: 'model', from: 3, to: 4 },
    ])
    const text = describeSegments(frames, NOW)
    expect(text).toContain('Observé : 5 h')
    expect(text).toContain('Extrapolation ECCC : 5 h 12 → 5 h 24')
    expect(text).toContain('Modèle HRDPS : 7 h → 8 h')
  })

  it('with a shorter extrapolation the transition moves, nothing else changes', () => {
    const short = [frames[0], frames[1], frames[3], frames[4]]
    expect(productSegments(short).map((s) => s.product)).toEqual([
      'observed',
      'extrapolated',
      'model',
    ])
  })
})
