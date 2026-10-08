import { describe, expect, it } from 'vitest'
import type { WindField } from '@/types'
import {
  windFavorability,
  windHourlyRow,
  sectorsLabel,
  MAX_SAMPLE_DISTANCE_METERS,
} from './windSummary'

const hour = (h: number, dir: number) => ({
  time: `2026-10-08T${String(h).padStart(2, '0')}:00`,
  directionDegrees: dir,
  speedKmh: 10 + h,
  gustsKmh: 20 + h,
  temperatureCelsius: 5,
  precipitationMm: 0,
  cloudCoverPercent: 0,
})
const field: WindField = {
  timezone: 'America/Toronto',
  samples: [
    { coordinate: { lat: 46.8, lng: -71.2 }, hourly: [hour(8, 315), hour(9, 0), hour(10, 90)] },
  ],
}

describe('windHourlyRow', () => {
  it('returns only the hours really present, with local labels', () => {
    const rows = windHourlyRow(field, { lat: 46.8, lng: -71.2 }, 0, 24)
    expect(rows.map((r) => r.hourLabel)).toEqual(['08:00', '09:00', '10:00'])
    expect(rows[0]).toMatchObject({ directionLabel: 'NO', speedKmh: 18, gustsKmh: 28 })
  })
  it('starts at the requested offset and keeps the shared offsets', () => {
    expect(windHourlyRow(field, { lat: 46.8, lng: -71.2 }, 1, 5).map((r) => r.offset)).toEqual([1, 2])
  })
  it('is empty without a field or when the nearest sample is too far', () => {
    expect(windHourlyRow(null, { lat: 46.8, lng: -71.2 })).toEqual([])
    expect(windHourlyRow(field, { lat: 48.5, lng: -71.2 })).toEqual([])
    expect(MAX_SAMPLE_DISTANCE_METERS).toBeGreaterThan(0)
  })
})

describe('windFavorability', () => {
  it('is non-renseigne without saved sectors, never a guess', () => {
    expect(windFavorability(0, undefined)).toBe('non-renseigne')
    expect(windFavorability(0, [])).toBe('non-renseigne')
  })
  it('compares the origin direction with the saved sectors', () => {
    expect(windFavorability(2, [0, 45])).toBe('favorable')
    expect(windFavorability(180, [0, 45])).toBe('defavorable')
  })
  it('labels sectors in compass order', () => {
    expect(sectorsLabel([90, 0])).toBe('N, E')
    expect(sectorsLabel(undefined)).toBe('aucun')
  })
})
