import { describe, expect, it } from 'vitest'
import { LAYER_LEGEND, valueForLayer, weatherLayerColor, weatherLayerGradientCss } from './weatherMapColors'
import type { WindHourlyReading } from '@/types'

const READING: WindHourlyReading = {
  time: '2026-08-17T10:00',
  directionDegrees: 270,
  speedKmh: 22,
  gustsKmh: 30,
  temperatureCelsius: 18,
  precipitationMm: 1.5,
  cloudCoverPercent: 60,
}

describe('weatherLayerColor', () => {
  it('clamps below the first stop to the first stop color', () => {
    expect(weatherLayerColor('wind', -10)).toBe(weatherLayerColor('wind', 0))
  })

  it('clamps above the last stop to the last stop color', () => {
    expect(weatherLayerColor('wind', 1000)).toBe(weatherLayerColor('wind', 65))
  })

  it('interpolates between two real stops, not a flat step', () => {
    const low = weatherLayerColor('temperature', -20, 1)
    const mid = weatherLayerColor('temperature', -10, 1)
    const high = weatherLayerColor('temperature', 0, 1)
    expect(low).not.toBe(mid)
    expect(mid).not.toBe(high)
  })

  it('respects the requested alpha', () => {
    expect(weatherLayerColor('wind', 20, 0.5)).toContain('0.5)')
    expect(weatherLayerColor('wind', 20, 1)).toContain('1)')
  })
})

describe('weatherLayerGradientCss', () => {
  it('produces a linear-gradient string covering the full legend range', () => {
    for (const layer of ['wind', 'temperature', 'precipitation', 'clouds'] as const) {
      const css = weatherLayerGradientCss(layer)
      expect(css).toMatch(/^linear-gradient\(to right, .*0%.*100%\)$/)
    }
  })
})

describe('LAYER_LEGEND', () => {
  it('has real min/max/unit for every layer', () => {
    expect(LAYER_LEGEND.wind).toEqual({ min: 0, max: 65, unit: 'km/h', label: 'Wind speed' })
    expect(LAYER_LEGEND.temperature.unit).toBe('°C')
    expect(LAYER_LEGEND.precipitation.unit).toBe('mm/h')
    expect(LAYER_LEGEND.clouds.max).toBe(100)
  })
})

describe('valueForLayer', () => {
  it('pulls the correct real field for each layer from one hourly reading', () => {
    expect(valueForLayer('wind', READING)).toBe(22)
    expect(valueForLayer('temperature', READING)).toBe(18)
    expect(valueForLayer('precipitation', READING)).toBe(1.5)
    expect(valueForLayer('clouds', READING)).toBe(60)
  })
})
