import { describe, expect, it } from 'vitest'
import {
  CURRENT_MAX_AGE_MS,
  formatAge,
  lastOuting,
  offlineCounts,
  summarizeWeather,
} from './summary'
import type {
  HourlyForecastEntry,
  Observation,
  OfflineArea,
  Track,
  WeatherForecast,
} from '@/types'

function track(id: string, startedAt: string): Track {
  return { id, name: `Trace ${id}`, points: [], startedAt }
}

function observation(id: string, timestamp: string, notes = ''): Observation {
  return { id, coordinate: { lat: 46, lng: -71 }, timestamp, notes }
}

function area(status: OfflineArea['status']): OfflineArea {
  return { id: status, status } as OfflineArea
}

function hourly(time: string, temperatureCelsius: number): HourlyForecastEntry {
  return {
    time,
    temperatureCelsius,
    relativeHumidityPercent: 50,
    surfacePressureHpa: 1010,
    precipitationMm: 0,
    cloudCoverPercent: 20,
    windSpeedKmh: 10 + temperatureCelsius,
    windGustsKmh: 20,
    visibilityMeters: 10000,
  }
}

function forecast(): WeatherForecast {
  return {
    timezone: 'America/Toronto',
    current: {
      timestamp: '2026-10-07T14:00',
      temperatureCelsius: 8,
      relativeHumidityPercent: 60,
      surfacePressureHpa: 1012,
      precipitationMm: 0,
      cloudCoverPercent: 40,
      windSpeedKmh: 12,
      windGustsKmh: 25,
      visibilityMeters: 10000,
    },
    hourly: ['13', '14', '15', '16', '17', '18'].map((h, i) =>
      hourly(`2026-10-07T${h}:00`, i),
    ),
  }
}

describe('formatAge', () => {
  it('speaks French at each scale and never invents an age', () => {
    expect(formatAge(10_000)).toBe('à l’instant')
    expect(formatAge(5 * 60_000)).toBe('il y a 5 min')
    expect(formatAge(3 * 3_600_000)).toBe('il y a 3 h')
    expect(formatAge(2 * 86_400_000)).toBe('il y a 2 j')
    expect(formatAge(Number.NaN)).toBe('date inconnue')
    expect(formatAge(-5)).toBe('date inconnue')
  })
})

describe('lastOuting', () => {
  it('is null with nothing recorded', () => {
    expect(lastOuting([], [])).toBeNull()
  })

  it('picks the most recent of tracks and journal entries', () => {
    const result = lastOuting(
      [track('a', '2026-10-01T10:00:00Z'), track('b', '2026-10-03T10:00:00Z')],
      [observation('o', '2026-10-05T08:00:00Z', 'Traces fraîches\nsuite')],
    )
    expect(result).toEqual({
      kind: 'observation',
      label: 'Traces fraîches',
      at: '2026-10-05T08:00:00Z',
    })
  })

  it('prefers a more recent track and ignores unreadable dates', () => {
    const result = lastOuting(
      [track('good', '2026-10-06T10:00:00Z'), track('bad', 'pas une date')],
      [observation('o', '2026-10-05T08:00:00Z')],
    )
    expect(result?.kind).toBe('track')
    expect(result?.label).toBe('Trace good')
  })

  it('names an entry without notes instead of showing an empty label', () => {
    expect(lastOuting([], [observation('o', '2026-10-05T08:00:00Z')])?.label).toBe(
      'Entrée de journal',
    )
  })
})

describe('offlineCounts', () => {
  it('counts by displayed status, legacy records included', () => {
    const { total, byStatus } = offlineCounts([
      area('downloading'),
      area('cancelled'),
      area('error'),
      // `complete` without a summary is the legacy, unverified state.
      area('complete'),
    ])
    expect(total).toBe(4)
    expect(byStatus.downloading).toBe(1)
    expect(byStatus.interrupted).toBe(1)
    expect(byStatus.error).toBe(1)
    expect(byStatus['complete-unverified']).toBe(1)
    expect(byStatus.complete).toBe(0)
  })
})

describe('summarizeWeather', () => {
  const fetched = '2026-10-07T18:00:00.000Z'

  it('calls a recent fresh reading « current »', () => {
    const now = new Date(Date.parse(fetched) + 10 * 60_000)
    const summary = summarizeWeather(forecast(), fetched, false, now)
    expect(summary.freshness).toBe('current')
    expect(summary.ageLabel).toBe('il y a 10 min')
    expect(summary.currentTime).toBe('14:00')
  })

  it('never calls a cached fallback « current », however recent', () => {
    const now = new Date(Date.parse(fetched) + 60_000)
    expect(summarizeWeather(forecast(), fetched, true, now).freshness).toBe('saved')
  })

  it('stops calling a reading « current » once it is too old', () => {
    const now = new Date(Date.parse(fetched) + CURRENT_MAX_AGE_MS + 60_000)
    expect(summarizeWeather(forecast(), fetched, false, now).freshness).toBe('saved')
  })

  it('tolerates a clock sampled just before the fetch, but not a date far in the future', () => {
    const fetchedMs = Date.parse(fetched)
    const slightly = summarizeWeather(
      forecast(),
      fetched,
      false,
      new Date(fetchedMs - 30_000),
    )
    expect(slightly.freshness).toBe('current')
    expect(slightly.ageLabel).toBe('à l’instant')

    const far = summarizeWeather(
      forecast(),
      fetched,
      false,
      new Date(fetchedMs - 3_600_000),
    )
    expect(far.freshness).toBe('saved')
    expect(far.ageLabel).toBe('date inconnue')
  })

  it('treats an unreadable fetch time as saved, not current', () => {
    const summary = summarizeWeather(forecast(), 'nope', false, new Date())
    expect(summary.freshness).toBe('saved')
    expect(summary.ageLabel).toBe('date inconnue')
  })

  it('takes the forecast line from the real hourly series 3 hours after the current hour', () => {
    const summary = summarizeWeather(forecast(), fetched, false, new Date(fetched))
    expect(summary.forecast).toMatchObject({ time: '17:00', temperatureCelsius: 4 })
  })

  it('leaves the forecast out when the series does not reach that far', () => {
    const short = forecast()
    short.hourly = short.hourly.slice(0, 3)
    expect(summarizeWeather(short, fetched, false, new Date(fetched)).forecast).toBeNull()
  })
})
