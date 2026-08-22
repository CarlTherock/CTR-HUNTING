import { describe, expect, it } from 'vitest'
import { hourOfDay, resampleHourly } from './chartResampling'
import type { HourlyForecastEntry } from '@/types'

function makeHourly(count: number): HourlyForecastEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    time: `2026-08-17T${String(i).padStart(2, '0')}:00`,
    temperatureCelsius: i,
    relativeHumidityPercent: 50,
    surfacePressureHpa: 1013,
    precipitationMm: 1,
    cloudCoverPercent: 20,
    windSpeedKmh: 10,
    windGustsKmh: 15,
    visibilityMeters: 20000,
  }))
}

describe('resampleHourly', () => {
  it('returns the input unchanged for 1h granularity', () => {
    const hourly = makeHourly(6)
    expect(resampleHourly(hourly, '1h')).toEqual(hourly)
  })

  it('averages real values within each bucket for temperature', () => {
    const hourly = makeHourly(6) // temps 0,1,2,3,4,5
    const buckets = resampleHourly(hourly, '3h')

    expect(buckets).toHaveLength(2)
    expect(buckets[0].temperatureCelsius).toBeCloseTo(1) // avg(0,1,2)
    expect(buckets[1].temperatureCelsius).toBeCloseTo(4) // avg(3,4,5)
  })

  it('sums (not averages) precipitation within each bucket', () => {
    const hourly = makeHourly(3) // 1mm each hour
    const buckets = resampleHourly(hourly, '3h')

    expect(buckets[0].precipitationMm).toBe(3)
  })

  it('uses the bucket\'s first real hour as its time, so real hour indices still line up', () => {
    const hourly = makeHourly(6)
    const buckets = resampleHourly(hourly, '3h')

    expect(buckets[0].time).toBe(hourly[0].time)
    expect(buckets[1].time).toBe(hourly[3].time)
  })

  it('handles a final partial bucket without dropping data', () => {
    const hourly = makeHourly(5) // 5 hours, bucket size 3 -> buckets of 3 and 2
    const buckets = resampleHourly(hourly, '3h')

    expect(buckets).toHaveLength(2)
    expect(buckets[1].temperatureCelsius).toBeCloseTo(3.5) // avg(3,4)
  })
})

describe('hourOfDay', () => {
  it('wraps real hour offsets into a 0-23 day-of-hour index', () => {
    expect(hourOfDay(0)).toBe(0)
    expect(hourOfDay(23)).toBe(23)
    expect(hourOfDay(24)).toBe(0)
    expect(hourOfDay(47)).toBe(23)
  })
})
