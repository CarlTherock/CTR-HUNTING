import { describe, expect, it } from 'vitest'
import * as SunCalc from 'suncalc'
import {
  computeSolunarPeriods,
  computeTemporalData,
  getMoonIllumination,
  getMoonTimes,
  getSunTimes,
  moonPhaseName,
  timeToPercent,
} from './temporal'
import type { Coordinate } from '@/types'

// Quebec City, a real fixed date — not asserting specific astronomical
// values (SunCalc's own accuracy is out of this project's scope to
// re-verify), only that this wrapper maps its output correctly.
const QUEBEC: Coordinate = { lat: 46.8139, lng: -71.208 }
const DATE = new Date('2026-08-17T12:00:00.000Z')

describe('getSunTimes', () => {
  it('matches SunCalc.getTimes, ISO-stringified, with real day length', () => {
    const raw = SunCalc.getTimes(DATE, QUEBEC.lat, QUEBEC.lng)
    const result = getSunTimes(DATE, QUEBEC)

    expect(raw.sunrise).not.toBeNull()
    expect(raw.sunset).not.toBeNull()
    if (!raw.sunrise || !raw.sunset) throw new Error('unreachable')

    expect(result.sunrise).toBe(raw.sunrise.toISOString())
    expect(result.sunset).toBe(raw.sunset.toISOString())
    expect(result.solarNoon).toBe(raw.solarNoon.toISOString())
    expect(result.dayLengthMs).toBe(raw.sunset.getTime() - raw.sunrise.getTime())
    expect(result.dayLengthMs).toBeGreaterThan(0)
  })

  it('reports dayLengthMs as null when there is no real sunrise or sunset (polar case)', () => {
    // Polar day in the high Arctic in August — sunrise/sunset genuinely
    // don't occur, never fabricated.
    const result = getSunTimes(DATE, { lat: 78, lng: 15 })
    if (!result.sunrise || !result.sunset) {
      expect(result.dayLengthMs).toBeNull()
    }
  })
})

describe('getMoonTimes', () => {
  it('matches SunCalc.getMoonTimes, ISO-stringified with real null-coalescing', () => {
    const raw = SunCalc.getMoonTimes(DATE, QUEBEC.lat, QUEBEC.lng)
    const result = getMoonTimes(DATE, QUEBEC)

    expect(result.rise).toBe(raw.rise ? raw.rise.toISOString() : null)
    expect(result.set).toBe(raw.set ? raw.set.toISOString() : null)
    expect(result.alwaysUp).toBe(raw.alwaysUp ?? false)
    expect(result.alwaysDown).toBe(raw.alwaysDown ?? false)
  })
})

describe('moonPhaseName', () => {
  it('names the 4 exact instants correctly', () => {
    expect(moonPhaseName(0)).toBe('New Moon')
    expect(moonPhaseName(0.25)).toBe('First Quarter')
    expect(moonPhaseName(0.5)).toBe('Full Moon')
    expect(moonPhaseName(0.75)).toBe('Last Quarter')
  })

  it('names the 4 in-between ranges correctly', () => {
    expect(moonPhaseName(0.1)).toBe('Waxing Crescent')
    expect(moonPhaseName(0.37)).toBe('Waxing Gibbous')
    expect(moonPhaseName(0.6)).toBe('Waning Gibbous')
    expect(moonPhaseName(0.85)).toBe('Waning Crescent')
  })

  it('wraps correctly near the 0/1 boundary', () => {
    expect(moonPhaseName(0.99)).toBe('New Moon')
    expect(moonPhaseName(-0.01)).toBe('New Moon')
  })
})

describe('getMoonIllumination', () => {
  it('matches SunCalc.getMoonIllumination and attaches a real phase name', () => {
    const raw = SunCalc.getMoonIllumination(DATE)
    const result = getMoonIllumination(DATE)

    expect(result.fraction).toBe(raw.fraction)
    expect(result.phase).toBe(raw.phase)
    expect(result.waxing).toBe(raw.waxing)
    expect(result.phaseName).toBe(moonPhaseName(raw.phase))
  })
})

describe('computeSolunarPeriods', () => {
  it('returns exactly 2 major periods (transit/anti-transit) plus a minor period per real rise/set', () => {
    const periods = computeSolunarPeriods(DATE, QUEBEC)

    const majors = periods.filter((p) => p.type === 'major')
    expect(majors).toHaveLength(2)
    expect(periods.length).toBeGreaterThanOrEqual(2)
    expect(periods.length).toBeLessThanOrEqual(4)
  })

  it('every period has start strictly before end', () => {
    const periods = computeSolunarPeriods(DATE, QUEBEC)
    for (const period of periods) {
      expect(new Date(period.start).getTime()).toBeLessThan(new Date(period.end).getTime())
    }
  })

  it('is sorted chronologically by start time', () => {
    const periods = computeSolunarPeriods(DATE, QUEBEC)
    const starts = periods.map((p) => p.start)
    expect(starts).toEqual([...starts].sort())
  })
})

describe('timeToPercent', () => {
  const dayStart = new Date('2026-08-17T00:00:00')

  it('places midnight at 0 and the following midnight at 100', () => {
    expect(timeToPercent(dayStart.toISOString(), dayStart)).toBe(0)
    expect(timeToPercent(new Date(dayStart.getTime() + 24 * 60 * 60_000).toISOString(), dayStart)).toBe(100)
  })

  it('places noon at 50', () => {
    expect(timeToPercent(new Date(dayStart.getTime() + 12 * 60 * 60_000).toISOString(), dayStart)).toBe(50)
  })

  it('clamps times outside the 24h window', () => {
    expect(timeToPercent(new Date(dayStart.getTime() - 60_000).toISOString(), dayStart)).toBe(0)
    expect(timeToPercent(new Date(dayStart.getTime() + 25 * 60 * 60_000).toISOString(), dayStart)).toBe(100)
  })
})

describe('computeTemporalData', () => {
  it('bundles real sun/moon/illumination/solunar data for the given date', () => {
    const data = computeTemporalData(DATE, QUEBEC)

    expect(data.date).toBe('2026-08-17')
    expect(data.sun.sunrise).not.toBeNull()
    expect(data.moon).toBeDefined()
    expect(data.illumination.phaseName).toBeDefined()
    expect(data.solunarPeriods.length).toBeGreaterThan(0)
  })
})
