import { describe, expect, it } from 'vitest'
import type { SavedForecast } from '@/types'
import {
  NO_SAVED_FORECAST_MESSAGE,
  assessDownload,
  buildSavedForecast,
  coverageAt,
  describeSavedStatus,
  expectedDates,
  findSavedWind,
  isStale,
  shouldReplace,
  windZoneBounds,
  wouldNotFit,
} from './savedForecastLogic'
import { QUEBEC, makePoint, makeWindField } from './savedForecastFixtures'

const C = QUEBEC.coordinate

function record(
  over: {
    days?: number
    start?: string
    point?: ReturnType<typeof makePoint> | null
    wind?: ReturnType<typeof makeWindField> | null
    fetchedAt?: string
    id?: string
  } = {},
): SavedForecast {
  const start = over.start ?? '2026-11-02'
  const days = over.days ?? 3
  return buildSavedForecast({
    id: over.id ?? 'a',
    place: QUEBEC,
    point: over.point === undefined ? makePoint(start, days) : over.point,
    windField: over.wind === undefined ? makeWindField(C, start, days) : over.wind,
    windBounds: windZoneBounds(C),
    requestedDays: days,
    fetchedAt: over.fetchedAt ?? '2026-11-02T14:00:00.000Z',
  })
}

describe('assessDownload', () => {
  it('is complete only with the place forecast, the wind grid and every day', () => {
    const r = record()
    expect(r.status).toBe('complete')
    expect(r.missing).toEqual([])
    expect(r.validFrom).toBe('2026-11-02T00:00')
    expect(r.validTo).toBe('2026-11-04T23:00')
    expect(r.formatVersion).toBe(1)
    expect(r.provider.name).toBe('Open-Meteo')
    expect(r.timezone).toBe('America/Toronto')
  })

  it('is partial when the wind grid is missing', () => {
    const r = record({ wind: null })
    expect(r.status).toBe('partial')
    expect(r.missing).toContain('wind-grid')
    expect(r.windField).toBeNull()
  })

  it('is partial when the place forecast is missing', () => {
    const r = record({ point: null })
    expect(r.status).toBe('partial')
    expect(r.missing).toContain('point')
  })

  it('is partial when a requested day is cut short', () => {
    const r = record({
      days: 3,
      point: makePoint('2026-11-02', 2),
      wind: makeWindField(C, '2026-11-02', 2),
    })
    expect(r.status).toBe('partial')
    expect(r.missing).toContain('hours')
  })

  it('is partial when a grid sample lacks the wind direction (null is not zero)', () => {
    const wind = makeWindField(C, '2026-11-02', 3, {
      patch: (_h, i) => (i === 5 ? { directionDegrees: Number.NaN } : {}),
    })
    const r = assessDownload({
      point: makePoint('2026-11-02', 3),
      windField: wind,
      requestedDays: 3,
    })
    expect(r.status).toBe('partial')
    expect(r.windSlotsWithoutRequired).toBeGreaterThan(0)
  })

  it('stays complete when only optional data (visibility, UV) is absent', () => {
    const point = makePoint('2026-11-02', 3, {
      patch: () => ({ visibilityMeters: null, uvIndex: null, surfacePressureHpa: null }),
    })
    const r = record({ point })
    expect(r.status).toBe('complete')
    expect(r.point?.hourly[0].visibilityMeters).toBeNull()
  })

  it('accepts a 23-hour day (spring clock change in Toronto)', () => {
    const skip = ['2026-03-08T02:00']
    const r = assessDownload({
      point: makePoint('2026-03-07', 3, { skipHours: skip }),
      windField: makeWindField(C, '2026-03-07', 3, { skipHours: skip }),
      requestedDays: 3,
    })
    expect(r.status).toBe('complete')
  })
})

describe('coverage and lookup', () => {
  const saved = record()

  it('reads « now » on the place clock, not the phone zone', () => {
    // 2026-11-05 03:30 UTC is still 2026-11-04 22:30 in Toronto (EST): covered.
    expect(coverageAt(saved, new Date('2026-11-05T03:30:00Z')).state).toBe('current')
    // 2026-11-05 05:30 UTC is 2026-11-05 00:30 in Toronto: the period is over.
    expect(coverageAt(saved, new Date('2026-11-05T05:30:00Z')).state).toBe('ended')
  })

  it('is « not-started » before the first hour and « unknown » without a period', () => {
    expect(coverageAt(saved, new Date('2026-10-30T12:00:00Z')).state).toBe('not-started')
    expect(coverageAt({ ...saved, validFrom: null }, new Date()).state).toBe('unknown')
  })

  it('finds the download for the same place and a covered hour', () => {
    const r = findSavedWind([saved], C, new Date('2026-11-03T15:00:00Z'))
    expect(r.kind).toBe('found')
  })

  it('never substitutes another place', () => {
    const far = { lat: C.lat + 1, lng: C.lng }
    expect(findSavedWind([saved], far, new Date('2026-11-03T15:00:00Z')).kind).toBe(
      'none',
    )
  })

  it('never substitutes another date: an ended period is reported, not used', () => {
    expect(findSavedWind([saved], C, new Date('2026-11-09T15:00:00Z')).kind).toBe('ended')
  })

  it('ignores unknown format versions and downloads without a wind grid', () => {
    const future = { ...saved, formatVersion: 99 }
    const noWind = record({ wind: null, id: 'b' })
    expect(
      findSavedWind([future, noWind], C, new Date('2026-11-03T15:00:00Z')).kind,
    ).toBe('none')
  })

  it('prefers the most recent of two covering downloads', () => {
    const newer = record({ id: 'n', fetchedAt: '2026-11-03T08:00:00.000Z' })
    const r = findSavedWind([saved, newer], C, new Date('2026-11-03T15:00:00Z'))
    expect(r.kind === 'found' && r.saved.id).toBe('n')
  })

  it('exposes the exact « no forecast » message required', () => {
    expect(NO_SAVED_FORECAST_MESSAGE).toBe(
      'Aucune prévision enregistrée pour ce lieu et cette date',
    )
  })
})

describe('status wording', () => {
  const saved = record()
  const now = new Date('2026-11-03T15:00:00Z')

  it('says « Prévisions enregistrées » online and the offline wording offline', () => {
    expect(describeSavedStatus(saved, now, true).lines[0]).toBe('Prévisions enregistrées')
    expect(describeSavedStatus(saved, now, false).lines[0]).toMatch(
      /^Hors ligne — prévisions téléchargées le /,
    )
  })

  it('shows « Couverture jusqu’au… »', () => {
    expect(describeSavedStatus(saved, now, true).lines.join('\n')).toMatch(
      /Couverture jusqu’au .*23 h/,
    )
  })

  it('flags old forecasts after 12 h (project choice) and expired periods', () => {
    expect(isStale(saved, new Date('2026-11-03T03:00:00Z'))).toBe(true)
    expect(describeSavedStatus(saved, now, true).lines.join('\n')).toMatch(
      /Prévisions anciennes/,
    )
    const ended = describeSavedStatus(saved, new Date('2026-11-09T15:00:00Z'), true)
    expect(ended.kinds).toContain('expired')
  })

  it('never calls a partial download complete', () => {
    const partial = record({ wind: null })
    const s = describeSavedStatus(partial, now, true)
    expect(s.kinds).toContain('partial')
    expect(s.lines.join('\n')).toMatch(/Téléchargement partiel/)
  })
})

describe('update policy, dates, storage', () => {
  it('keeps a complete download when the update is partial', () => {
    expect(shouldReplace({ status: 'complete' }, { status: 'partial' })).toBe(false)
    expect(shouldReplace({ status: 'complete' }, { status: 'complete' })).toBe(true)
    expect(shouldReplace({ status: 'partial' }, { status: 'partial' })).toBe(true)
    expect(shouldReplace(undefined, { status: 'partial' })).toBe(true)
  })

  it('lists the dates covered before downloading (72 h = 3 days)', () => {
    expect(expectedDates(new Date(2026, 10, 2, 14, 0), 3)).toEqual({
      from: '2026-11-02',
      to: '2026-11-04',
      count: 3,
    })
  })

  it('refuses a download that would not fit, but allows when the quota is unknown', () => {
    expect(wouldNotFit(1_000_000, 1_500_000)).toBe(true)
    expect(wouldNotFit(1_000_000, 50_000_000)).toBe(false)
    expect(wouldNotFit(1_000_000, null)).toBe(false)
  })
})
