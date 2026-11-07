import { describe, expect, it } from 'vitest'
import type { Observation, Track } from '@/types'
import { SEASONAL_BANDS, bandPosition, dateFraction } from './seasonalBands'
import { summarizeObservations } from './observationsSummary'

const TZ = 'America/Toronto'
const [quebec, wisconsin] = SEASONAL_BANDS as [
  (typeof SEASONAL_BANDS)[number],
  (typeof SEASONAL_BANDS)[number],
]

function obs(
  id: string,
  iso: string,
  kind: 'sighting' | 'track' | 'rub' = 'sighting',
  extra: Partial<Observation> = {},
  lat = 46.5,
): Observation {
  return {
    id,
    timestamp: iso,
    notes: '',
    coordinate: { lat, lng: -72.5 },
    deer: { kind },
    ...extra,
  }
}

describe('seasonalBands', () => {
  it('keeps exactly two separate bands and no conception band', () => {
    expect(SEASONAL_BANDS.map((b) => b.id)).toEqual(['quebec', 'wisconsin'])
  })
  it('positions a date against each band independently', () => {
    expect(bandPosition('2026-10-20', wisconsin)).toBe('avant')
    expect(bandPosition('2026-11-07', wisconsin)).toBe('dans')
    expect(bandPosition('2026-11-13', wisconsin)).toBe('apres')
    expect(bandPosition('2026-10-31', quebec)).toBe('avant')
    expect(bandPosition('2026-11-07', quebec)).toBe('dans')
    expect(bandPosition('2026-12-31', quebec)).toBe('dans')
  })
  it('places the date marker on the axis', () => {
    expect(dateFraction('2026-10-15')).toBe(0)
    expect(dateFraction('2026-12-31')).toBe(1)
    expect(dateFraction('2026-11-07')).toBeGreaterThan(0.2)
  })
})

describe('summarizeObservations', () => {
  it('is descriptive from the very first entry', () => {
    const s = summarizeObservations([obs('a', '2026-11-05T12:00:00Z')], [], {
      timeZone: TZ,
    })
    expect(s.entries).toBe(1)
    expect(s.events).toBe(1)
    expect(s.daysWithEntries).toBe(1)
    expect(s.statement).toMatch(/ne permettent pas de conclure/)
  })
  it('separates direct sightings, ground signs and cameras', () => {
    const s = summarizeObservations(
      [
        obs('a', '2026-11-05T12:00:00Z', 'sighting'),
        obs('b', '2026-11-06T12:00:00Z', 'rub'),
        obs('c', '2026-11-07T12:00:00Z', 'sighting', { waypointId: 'cam1' }),
      ],
      [],
      { timeZone: TZ, cameraWaypointIds: new Set(['cam1']) },
    )
    expect(s.byGroup.direct.entries).toBe(1)
    expect(s.byGroup.ground_sign.entries).toBe(1)
    expect(s.byGroup.camera.entries).toBe(1)
  })
  it('counts a close sequence as one event', () => {
    const s = summarizeObservations(
      [
        obs('a', '2026-11-05T12:00:00Z', 'sighting', { photoIds: ['1', '2'] }),
        obs('b', '2026-11-05T12:10:00Z', 'sighting', { photoIds: ['3'] }),
        obs('c', '2026-11-05T16:00:00Z', 'sighting'),
      ],
      [],
      { timeZone: TZ },
    )
    expect(s.entries).toBe(3)
    expect(s.events).toBe(2)
  })
  it('does not group far-apart entries', () => {
    const s = summarizeObservations(
      [
        obs('a', '2026-11-05T12:00:00Z'),
        obs('b', '2026-11-05T12:05:00Z', 'sighting', {}, 46.6),
      ],
      [],
      { timeZone: TZ },
    )
    expect(s.events).toBe(2)
  })
  it('reports days covered and uses tracks as effort only when they exist', () => {
    const track = {
      id: 't',
      name: 'sortie',
      points: [],
      startedAt: '2026-11-06T11:00:00Z',
    } as Track
    const without = summarizeObservations(
      [obs('a', '2026-11-05T12:00:00Z'), obs('b', '2026-11-08T12:00:00Z')],
      [],
      { timeZone: TZ },
    )
    expect(without.daysSpan).toBe(4)
    expect(without.daysWithEntries).toBe(2)
    expect(without.hasEffort).toBe(false)
    const withTrack = summarizeObservations(
      [obs('a', '2026-11-05T12:00:00Z'), obs('b', '2026-11-08T12:00:00Z')],
      [track],
      { timeZone: TZ },
    )
    expect(withTrack.effortDays).toBe(1)
    expect(withTrack.statement).toMatch(/pas assez pour conclure/)
  })
  it('handles an empty journal', () => {
    const s = summarizeObservations([], [], { timeZone: TZ })
    expect(s.entries).toBe(0)
    expect(s.statement).toMatch(/Aucune observation/)
  })
  it('ignores entries that are not deer entries', () => {
    const plain: Observation = {
      id: 'x',
      timestamp: '2026-11-05T12:00:00Z',
      notes: '',
      coordinate: { lat: 1, lng: 1 },
    }
    expect(summarizeObservations([plain], [], { timeZone: TZ }).entries).toBe(0)
  })
})
