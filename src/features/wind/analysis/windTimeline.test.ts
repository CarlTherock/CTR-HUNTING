import { describe, expect, it } from 'vitest'
import type { WindField, WindHourlyReading } from '@/types'
import {
  analysisStatus,
  boundsCover,
  buildForecastDays,
  dayLabel,
  describeWind,
  findDayOfIndex,
  forecastAge,
  nearestAvailableIndex,
  nowSlotIndex,
  readSlot,
  slotForDayChange,
  stepIndex,
} from './windTimeline'

const TZ = 'America/Toronto'

function reading(time: string, dir: number, speed: number): WindHourlyReading {
  return {
    time,
    directionDegrees: dir,
    speedKmh: speed,
    gustsKmh: speed + 8,
    temperatureCelsius: 10,
    precipitationMm: 0,
    cloudCoverPercent: 0,
  }
}

/** 48 real-shaped hourly slots from `2026-10-09T00:00`; direction = 5° × index. */
function field(dates: string[] = ['2026-10-09', '2026-10-10']): WindField {
  const hourly = dates.flatMap((d) =>
    Array.from({ length: 24 }, (_, h) =>
      reading(`${d}T${String(h).padStart(2, '0')}:00`, 0, 0),
    ),
  )
  const withData = hourly.map((r, i) => ({
    ...r,
    directionDegrees: (i * 5) % 360,
    speedKmh: 5 + i,
  }))
  return {
    timezone: TZ,
    samples: [
      { coordinate: { lat: 46.8, lng: -71.2 }, hourly: withData },
      {
        coordinate: { lat: 47.5, lng: -70.0 },
        hourly: withData.map((r) => ({ ...r, speedKmh: 99 })),
      },
    ],
  }
}

// 2026-10-09 10:55 in Toronto (UTC-4)
const NOW = new Date('2026-10-09T14:55:00Z')

describe('buildForecastDays', () => {
  it('lists only the days the field really covers, labelled in French', () => {
    const days = buildForecastDays(field(), NOW)
    expect(days.map((d) => d.dateKey)).toEqual(['2026-10-09', '2026-10-10'])
    expect(days.map((d) => dayLabel(d))).toEqual(["Aujourd'hui", 'Demain'])
    expect(days[0].slots).toHaveLength(24)
    expect(days[1].slots[0]).toMatchObject({ index: 24, hour: 0 })
  })

  it('never offers days beyond the horizon nor days already over', () => {
    const f = field(['2026-10-08', '2026-10-09'])
    const days = buildForecastDays(f, NOW)
    expect(days.map((d) => d.dateKey)).toEqual(['2026-10-09'])
    expect(days[0].slots[0].index).toBe(24)
  })

  it("switches « Aujourd'hui »/« Demain » with the local date, not the UTC one", () => {
    // 2026-10-10 00:30 in Toronto is already 04:30Z the same day, but
    // 2026-10-09 23:30 Toronto is 03:30Z on the 10th — still "today" there.
    const late = new Date('2026-10-10T03:30:00Z')
    const days = buildForecastDays(field(), late)
    expect(days[0].dateKey).toBe('2026-10-09')
    expect(days[0].relative).toBe('today')
    const next = new Date('2026-10-10T04:30:00Z') // 00:30 on the 10th, local
    const after = buildForecastDays(field(), next)
    expect(after.map((d) => d.dateKey)).toEqual(['2026-10-10'])
    expect(after[0].relative).toBe('today')
  })

  it('labels a farther day with its weekday and date', () => {
    const days = buildForecastDays(field(['2026-10-09', '2026-10-10', '2026-10-11']), NOW)
    expect(dayLabel(days[2])).toMatch(/dim/i)
    expect(dayLabel(days[2])).toContain('11')
  })

  it('returns nothing without data', () => {
    expect(buildForecastDays(null, NOW)).toEqual([])
    expect(buildForecastDays({ timezone: TZ, samples: [] }, NOW)).toEqual([])
  })
})

describe('day change and navigation', () => {
  const days = buildForecastDays(field(), NOW)

  it('keeps the same hour when the other day has it', () => {
    expect(slotForDayChange(days[1], 14)).toEqual({ index: 38, sameHour: true, hour: 14 })
  })

  it('picks the nearest valid slot, and says it was adjusted, when the hour is missing', () => {
    const partial = buildForecastDays(
      {
        ...field(),
        samples: [
          { ...field().samples[0], hourly: field().samples[0].hourly.slice(0, 30) },
        ],
      },
      NOW,
    )
    // tomorrow only has 00:00-05:00; asking for 14 h falls back to 05:00
    expect(slotForDayChange(partial[1], 14)).toEqual({
      index: 29,
      sameHour: false,
      hour: 5,
    })
  })

  it('steps through available slots across midnight and clamps at the ends', () => {
    expect(stepIndex(days, 23, 1)).toBe(24)
    expect(stepIndex(days, 24, -1)).toBe(23)
    expect(stepIndex(days, 0, -5)).toBe(0)
    expect(stepIndex(days, 47, 3)).toBe(47)
  })

  it('finds the day of an index and the nearest available index', () => {
    expect(findDayOfIndex(days, 30)?.dateKey).toBe('2026-10-10')
    expect(findDayOfIndex(days, 99)).toBeNull()
    expect(nearestAvailableIndex(days, 99)).toBe(47)
  })

  it('« Maintenant » is the real current hour of the loaded field, or nothing', () => {
    expect(nowSlotIndex(field(), NOW)).toBe(10)
    expect(nowSlotIndex(field(['2026-10-20']), NOW)).toBeNull()
    expect(nowSlotIndex(null, NOW)).toBeNull()
  })
})

describe('readSlot and describeWind', () => {
  it('reads the nearest real sample at the requested hour', () => {
    const f = field()
    const here = readSlot(f, { lat: 46.8, lng: -71.2 }, 12)
    expect(here.kind).toBe('ok')
    if (here.kind === 'ok') {
      expect(here.reading.speedKmh).toBe(17)
      expect(here.reading.directionDegrees).toBe(60)
    }
    const far = readSlot(f, { lat: 47.5, lng: -70.0 }, 12)
    expect(far.kind === 'ok' && far.reading.speedKmh).toBe(99)
  })

  it('reports a missing slot instead of reusing another hour', () => {
    expect(readSlot(field(), { lat: 46.8, lng: -71.2 }, 200)).toEqual({ kind: 'missing' })
    expect(readSlot(null, { lat: 46.8, lng: -71.2 }, 0)).toEqual({ kind: 'missing' })
  })

  it('keeps the origin direction (text) apart from the travel direction (particles)', () => {
    const d = describeWind(reading('2026-10-09T10:00', 315, 12.4))
    expect(d.fromLabel).toBe('NO')
    expect(d.fromDegrees).toBe(315)
    expect(d.toLabel).toBe('SE')
    expect(d.toDegrees).toBe(135)
    expect(d.speedKmh).toBe(12)
    expect(d.gustsKmh).toBe(20)
  })

  it('has no gusts when the source gave none', () => {
    const r = { ...reading('2026-10-09T10:00', 0, 5), gustsKmh: Number.NaN }
    expect(describeWind(r).gustsKmh).toBeNull()
  })
})

describe('age, status, bounds', () => {
  it('formats the age and flags old forecasts', () => {
    const at = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString()
    expect(forecastAge(at(0), NOW)).toMatchObject({ label: "à l'instant", stale: false })
    expect(forecastAge(at(12), NOW)).toMatchObject({
      label: 'il y a 12 min',
      stale: false,
    })
    expect(forecastAge(at(300), NOW)).toMatchObject({ label: 'il y a 5 h', stale: true })
    expect(forecastAge(null, NOW)).toBeNull()
    expect(forecastAge('pas une date', NOW)).toBeNull()
  })

  it('derives an honest status', () => {
    const s = analysisStatus
    expect(s({ hasField: false, loading: true, failed: false, fromCache: false })).toBe(
      'loading',
    )
    expect(s({ hasField: false, loading: false, failed: true, fromCache: false })).toBe(
      'unavailable',
    )
    expect(s({ hasField: true, loading: true, failed: false, fromCache: false })).toBe(
      'refreshing',
    )
    expect(s({ hasField: true, loading: false, failed: false, fromCache: true })).toBe(
      'cached',
    )
    expect(s({ hasField: true, loading: false, failed: true, fromCache: false })).toBe(
      'refresh-failed',
    )
    expect(s({ hasField: true, loading: false, failed: false, fromCache: false })).toBe(
      'ready',
    )
  })

  it('accepts a saved copy only for the area it covers', () => {
    const b = { west: -71.3, south: 46.7, east: -71.1, north: 46.9 }
    expect(boundsCover(b, { lat: 46.8, lng: -71.2 })).toBe(true)
    expect(boundsCover(b, { lat: 46.93, lng: -71.2 }, 0.05)).toBe(true)
    expect(boundsCover(b, { lat: 48, lng: -71.2 }, 0.05)).toBe(false)
  })
})
