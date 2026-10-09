import { describe, expect, it } from 'vitest'
import type { Observation, Waypoint } from '@/types'
import { buildShotEntry, buildTimeline, shotEntries, shotMarkers } from './shotLogic'

const POS = { lat: 46.8, lng: -71.2, accuracyMeters: 5 }
const base = {
  species: 'deer' as const,
  shotAtMs: Date.parse('2026-10-07T10:00:00.000Z'),
  position: POS,
  positionOrigin: 'gps' as const,
  reaction: '',
  fleeDirection: '',
  estimated: null,
  lastConfirmed: null,
  notes: '',
}

describe('buildShotEntry', () => {
  it('records only what was entered', () => {
    const built = buildShotEntry(base)
    expect(built).toMatchObject({ ok: true, shot: { species: 'deer' }, notes: '' })
    if (built.ok) {
      expect(Object.keys(built.shot)).toEqual(['species'])
      expect(built.timestamp).toBe('2026-10-07T10:00:00.000Z')
    }
  })

  it('keeps the observed reaction, direction and manual positions', () => {
    const built = buildShotEntry({
      ...base,
      species: 'moose',
      reaction: ' a sursauté puis couru ',
      fleeDirection: '90',
      estimated: { lat: 46.81, lng: -71.21 },
      lastConfirmed: { lat: 46.802, lng: -71.201 },
      notes: ' vent de face ',
      searchSessionId: 's1',
    })
    expect(built).toMatchObject({
      ok: true,
      notes: 'vent de face',
      shot: {
        species: 'moose',
        reaction: 'a sursauté puis couru',
        fleeDirectionDegrees: 90,
        estimatedAnimalPosition: { lat: 46.81, lng: -71.21 },
        lastConfirmedPosition: { lat: 46.802, lng: -71.201 },
        searchSessionId: 's1',
      },
    })
  })

  it('refuses a missing position or time instead of inventing them', () => {
    expect(buildShotEntry({ ...base, position: null })).toMatchObject({ ok: false })
    expect(buildShotEntry({ ...base, shotAtMs: null })).toMatchObject({ ok: false })
  })
})

describe('timeline and markers', () => {
  const entry: Observation = {
    id: 'o1',
    coordinate: POS,
    timestamp: '2026-10-07T10:00:00.000Z',
    notes: '',
    shot: {
      species: 'deer',
      lastConfirmedPosition: { lat: 46.801, lng: -71.201 },
      estimatedAnimalPosition: { lat: 46.81, lng: -71.21 },
    },
  }
  const clue = (id: string, at: string): Waypoint => ({
    id,
    name: `Sang ${id}`,
    coordinate: { lat: 46.8, lng: -71.2 },
    category: 'blood',
    createdAt: at,
    updatedAt: at,
    origin: 'gps',
  })

  it('orders the shot and the clues chronologically', () => {
    const items = buildTimeline(entry, [
      clue('2', '2026-10-07T10:20:00.000Z'),
      clue('1', '2026-10-07T10:05:00.000Z'),
    ])
    expect(items.map((i) => i.label)).toEqual(['Tir', 'Sang 1', 'Sang 2'])
  })

  it('labels the estimated position as manual and shows three display markers', () => {
    const markers = shotMarkers(entry)
    expect(markers.map((m) => m.name)).toEqual([
      'Lieu du tir',
      'Dernière position confirmée',
      'Estimation manuelle',
    ])
  })

  it('lists shot entries newest first and ignores other entries', () => {
    const other: Observation = { ...entry, id: 'o2', shot: undefined }
    const newer: Observation = {
      ...entry,
      id: 'o3',
      timestamp: '2026-10-08T10:00:00.000Z',
    }
    expect(shotEntries([entry, other, newer]).map((o) => o.id)).toEqual(['o3', 'o1'])
  })
})
