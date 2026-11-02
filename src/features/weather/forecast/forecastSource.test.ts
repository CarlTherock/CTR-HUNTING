import { describe, expect, it } from 'vitest'
import { QUEBEC, makePoint, makeWindField } from '../offline/savedForecastFixtures'
import { buildSavedForecast, windZoneBounds } from '../offline/savedForecastLogic'
import { conditionOf } from './weatherCodes'
import {
  chooseForecastSource,
  defaultHourKey,
  hoursOf,
  visibleDays,
  windIndexOfHour,
} from './forecastSource'

const C = QUEBEC.coordinate
const NOW = new Date('2026-11-03T15:00:00Z') // 10:00 in Toronto

function saved(id: string, fetchedAt: string, start = '2026-11-02', place = QUEBEC) {
  return buildSavedForecast({
    id,
    place,
    point: makePoint(start, 3),
    windField: makeWindField(place.coordinate, start, 3),
    windBounds: windZoneBounds(place.coordinate),
    requestedDays: 3,
    fetchedAt,
  })
}

describe('chooseForecastSource', () => {
  it('prefers the live answer', () => {
    const live = {
      point: makePoint('2026-11-03', 5),
      coordinate: C,
      fetchedAt: '2026-11-03T14:59:00.000Z',
      origin: 'live' as const,
    }
    const r = chooseForecastSource({
      live,
      saved: [saved('a', '2026-11-02T14:00:00.000Z')],
      coordinate: C,
      now: NOW,
    })
    expect(r.kind === 'ready' && r.origin).toBe('live')
  })

  it('offline: uses the saved download of this place, flagged as saved', () => {
    const r = chooseForecastSource({
      live: null,
      saved: [saved('a', '2026-11-02T14:00:00.000Z')],
      coordinate: C,
      now: NOW,
    })
    expect(r.kind === 'ready' && r.origin).toBe('saved')
    expect(r.kind === 'ready' && r.saved?.id).toBe('a')
  })

  it('offline: takes the newest between the cached copy and a download', () => {
    const live = {
      point: makePoint('2026-11-03', 5),
      coordinate: C,
      fetchedAt: '2026-11-03T12:00:00.000Z',
      origin: 'cached' as const,
    }
    const r = chooseForecastSource({
      live,
      saved: [saved('a', '2026-11-02T14:00:00.000Z')],
      coordinate: C,
      now: NOW,
    })
    expect(r.kind === 'ready' && r.origin).toBe('cached')
  })

  it('never substitutes another place', () => {
    const far = { lat: C.lat + 2, lng: C.lng }
    const r = chooseForecastSource({
      live: null,
      saved: [saved('a', '2026-11-02T14:00:00.000Z')],
      coordinate: far,
      now: NOW,
    })
    expect(r).toEqual({ kind: 'none', reason: 'none' })
  })

  it('never substitutes another date: an ended download is reported as ended', () => {
    const r = chooseForecastSource({
      live: null,
      saved: [saved('a', '2026-11-02T14:00:00.000Z')],
      coordinate: C,
      now: new Date('2026-11-12T15:00:00Z'),
    })
    expect(r).toEqual({ kind: 'none', reason: 'ended' })
  })
})

describe('days, hours and wind index', () => {
  const point = makePoint('2026-11-02', 3)

  it('offers days from today on only', () => {
    expect(visibleDays(point, NOW).map((d) => d.date)).toEqual([
      '2026-11-03',
      '2026-11-04',
    ])
  })

  it('starts on the current hour today and on 12:00 another day', () => {
    expect(defaultHourKey(point, '2026-11-03', NOW)).toBe('2026-11-03T10:00')
    expect(defaultHourKey(point, '2026-11-04', NOW)).toBe('2026-11-04T12:00')
    expect(defaultHourKey(point, '2026-12-25', NOW)).toBeNull()
    expect(hoursOf(point, '2026-11-03')).toHaveLength(24)
  })

  it('finds the hour in the loaded wind field, or null when it is outside', () => {
    const field = makeWindField(C, '2026-11-02', 3)
    expect(windIndexOfHour(field, '2026-11-03T10:00')).toBe(24 + 10)
    expect(windIndexOfHour(field, '2026-11-09T10:00')).toBeNull()
    expect(windIndexOfHour(null, '2026-11-03T10:00')).toBeNull()
  })
})

describe('weather codes', () => {
  it('maps WMO codes and never invents a sky for a missing code', () => {
    expect(conditionOf(0).label).toBe('Ciel dégagé')
    expect(conditionOf(63).icon).toBe('rain')
    expect(conditionOf(95).icon).toBe('storm')
    expect(conditionOf(null).icon).toBe('unknown')
    expect(conditionOf(null).label).toBe('Conditions indisponibles')
    expect(conditionOf(1234).icon).toBe('unknown')
  })
})
