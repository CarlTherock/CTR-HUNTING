import { describe, expect, it } from 'vitest'
import type { Observation, Territory } from '@/types'
import {
  canAttachCurrentConditions,
  deerEntries,
  directionLabel,
  filterDeerEntries,
  fromDatetimeLocal,
  parseCount,
  positionNotice,
  summarizeDeer,
  toDatetimeLocal,
} from './deerLogic'

const T1: Territory = {
  id: 't1',
  name: 'Lot Nord',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function obs(id: string, partial: Partial<Observation>): Observation {
  return {
    id,
    coordinate: { lat: 46, lng: -71 },
    timestamp: new Date(2026, 9, 1, 7, 0).toISOString(),
    notes: '',
    ...partial,
  }
}

const SAMPLE: Observation[] = [
  obs('a', {
    timestamp: new Date(2026, 9, 1, 6, 30).toISOString(),
    territoryId: 't1',
    deer: { kind: 'sighting', count: 2 },
    conditions: {
      temperatureCelsius: 4,
      windSpeedKmh: 10,
      windDirectionDegrees: 270,
      cloudCoverPercent: 20,
    },
  }),
  obs('b', {
    timestamp: new Date(2026, 9, 2, 17, 10).toISOString(),
    deer: { kind: 'track' },
  }),
  obs('c', {
    timestamp: new Date(2026, 9, 3, 6, 5).toISOString(),
    territoryId: 't1',
    deer: { kind: 'rub' },
    conditions: {
      temperatureCelsius: -2,
      windSpeedKmh: 22,
      windDirectionDegrees: 0,
      cloudCoverPercent: 90,
    },
  }),
  obs('plain', { notes: 'banale entrée de journal' }),
]

describe('deer entries', () => {
  it('only entries classified by the user are deer entries (no automatic reclassification)', () => {
    expect(deerEntries(SAMPLE).map((o) => o.id)).toEqual(['a', 'b', 'c'])
  })

  it('filters by territory, kind and observation date', () => {
    const territories = [T1]
    const base = { territory: { kind: 'all' } as const, kinds: [] as never[] }
    expect(filterDeerEntries(SAMPLE, base, territories)).toHaveLength(3)
    expect(
      filterDeerEntries(
        SAMPLE,
        { ...base, territory: { kind: 'territory', id: 't1' } },
        territories,
      ).map((o) => o.id),
    ).toEqual(['a', 'c'])
    expect(
      filterDeerEntries(
        SAMPLE,
        { ...base, territory: { kind: 'unclassified' } },
        territories,
      ).map((o) => o.id),
    ).toEqual(['b'])
    expect(
      filterDeerEntries(SAMPLE, { ...base, kinds: ['track', 'rub'] }, territories).map(
        (o) => o.id,
      ),
    ).toEqual(['b', 'c'])
    expect(
      filterDeerEntries(
        SAMPLE,
        {
          ...base,
          fromMs: new Date(2026, 9, 2).getTime(),
          toMs: new Date(2026, 9, 2, 23, 59).getTime(),
        },
        territories,
      ).map((o) => o.id),
    ).toEqual(['b'])
  })
})

describe('summarizeDeer', () => {
  it('counts what was entered, hours, kinds, territories and conditions', () => {
    const summary = summarizeDeer(deerEntries(SAMPLE), [T1])
    expect(summary.entries).toBe(3)
    expect(summary.animalsCounted).toBe(2)
    expect(summary.withoutCount).toBe(2) // no count typed = not zero, not one
    expect(summary.perHour[6]).toBe(2)
    expect(summary.perHour[17]).toBe(1)
    expect(summary.kinds.map((k) => k.kind)).toEqual(['sighting', 'track', 'rub'])
    expect(summary.territories).toEqual([
      { label: 'Lot Nord', count: 2 },
      { label: 'Non classé', count: 1 },
    ])
    expect(summary.conditions.entriesWithConditions).toBe(2)
    expect(summary.conditions.temperature).toEqual({ min: -2, max: 4 })
    expect(summary.conditions.wind).toEqual({ min: 10, max: 22 })
  })

  it('is empty and claims nothing when there are no entries', () => {
    const summary = summarizeDeer([], [])
    expect(summary.entries).toBe(0)
    expect(summary.period).toBeUndefined()
    expect(summary.conditions.temperature).toBeUndefined()
  })
})

describe('conditions, dates and input parsing', () => {
  it('attaches current conditions only to an observation made about now', () => {
    const now = Date.UTC(2026, 9, 7, 12, 0)
    expect(canAttachCurrentConditions(now - 5 * 60_000, now)).toBe(true)
    expect(canAttachCurrentConditions(now - 3 * 3_600_000, now)).toBe(false)
    expect(canAttachCurrentConditions(now + 3 * 3_600_000, now)).toBe(false)
  })

  it('round-trips datetime-local values in local time', () => {
    const ms = new Date(2026, 9, 7, 6, 45).getTime()
    expect(toDatetimeLocal(ms)).toBe('2026-10-07T06:45')
    expect(fromDatetimeLocal('2026-10-07T06:45')).toBe(ms)
    expect(fromDatetimeLocal('n’importe quoi')).toBeNull()
  })

  it('never invents a count', () => {
    expect(parseCount('')).toBeUndefined()
    expect(parseCount('0')).toBeUndefined()
    expect(parseCount('abc')).toBeUndefined()
    expect(parseCount('3')).toBe(3)
  })

  it('names the nearest compass direction and flags absent or imprecise positions', () => {
    expect(directionLabel(350)).toBe('Nord')
    expect(directionLabel(100)).toBe('Est')
    expect(positionNotice(false, undefined)).toBe('none')
    expect(positionNotice(true, undefined)).toBe('imprecise')
    expect(positionNotice(true, 40)).toBe('imprecise')
    expect(positionNotice(true, 6)).toBe('ok')
  })
})
