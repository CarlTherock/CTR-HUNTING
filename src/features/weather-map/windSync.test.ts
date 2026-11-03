import { describe, expect, it } from 'vitest'
import type { WindField } from '@/types'
import { windSync } from './windSync'

const hourly = ['2026-11-03T13:00', '2026-11-03T14:00', '2026-11-03T15:00'].map(
  (time) => ({
    time,
    speedKmh: 10,
    directionDegrees: 270,
    gustsKmh: 20,
  }),
)
const field = {
  timezone: 'America/Toronto',
  samples: [{ coordinate: { lat: 46, lng: -71 }, hourly }],
} as unknown as WindField

describe('windSync', () => {
  it('reports no field when the wind is not loaded', () => {
    expect(windSync(null, '2026-11-03T19:00:00Z', 0)).toEqual({ state: 'no-field' })
  })

  it('is synced when the frame hour exists in the wind forecast', () => {
    // 19:00Z = 14:00 in Toronto (EST, UTC-5).
    expect(windSync(field, '2026-11-03T19:10:00Z', 1)).toEqual({
      state: 'synced',
      windHourLabel: '14 h',
    })
  })

  it('says so when the frame is outside the wind period, keeping the wind hour shown', () => {
    expect(windSync(field, '2026-11-05T19:00:00Z', 2)).toEqual({
      state: 'out-of-range',
      windHourLabel: '15 h',
    })
  })
})
