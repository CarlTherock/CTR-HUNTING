import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FieldTerrainDatabase } from './db'

const DB_NAME = 'field-terrain-intelligence'

/** The schema exactly as shipped at version 5 (territories), declared
 * independently of `db.ts` so a REAL v5 database is upgraded by current code. */
function openVersion5(): Dexie {
  const legacy = new Dexie(DB_NAME)
  legacy.version(1).stores({
    waypoints: 'id, category, createdAt',
    tracks: 'id, startedAt',
    observations: 'id, waypointId, timestamp',
    settings: 'key',
    syncQueue: 'id, entity, entityId, queuedAt',
  })
  legacy.version(2).stores({ photos: 'id, waypointId, createdAt' })
  legacy.version(3).stores({ offlineAreas: 'id, status, createdAt' })
  legacy.version(4).stores({ photos: 'id, waypointId, observationId, createdAt' })
  legacy.version(5).stores({
    territories: 'id, name, createdAt',
    waypoints: 'id, category, createdAt, territoryId',
    tracks: 'id, startedAt, territoryId',
    observations: 'id, waypointId, timestamp, territoryId',
  })
  return legacy
}

const WAYPOINT = {
  id: 'w1',
  name: 'Poste',
  coordinate: { lat: 46.8, lng: -71.2 },
  category: 'stand_blind',
  territoryId: 'terr1',
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
}
const TRACK = {
  id: 't1',
  name: 'Crête',
  points: [{ lat: 46.8, lng: -71.2, timestamp: '2026-08-16T10:00:05.000Z' }],
  startedAt: '2026-08-16T10:00:00.000Z',
  territoryId: 'terr1',
}

describe('Dexie migration v5 -> v6 (blood-search sessions)', () => {
  beforeEach(async () => {
    await Dexie.delete(DB_NAME)
  })
  afterEach(async () => {
    await Dexie.delete(DB_NAME)
  })

  it('keeps existing data byte-for-byte, adds an empty sessions table and the new indexes', async () => {
    const legacy = openVersion5()
    await legacy.open()
    expect(legacy.verno).toBe(5)
    await legacy.table('territories').add({
      id: 'terr1',
      name: 'Nord',
      createdAt: '2026-08-01T10:00:00.000Z',
      updatedAt: '2026-08-01T10:00:00.000Z',
    })
    await legacy.table('waypoints').add(WAYPOINT)
    await legacy.table('tracks').add(TRACK)
    legacy.close()

    const upgraded = new FieldTerrainDatabase()
    await upgraded.open()
    try {
      expect(upgraded.verno).toBe(6)
      expect(await upgraded.waypoints.toArray()).toEqual([WAYPOINT])
      expect(await upgraded.tracks.toArray()).toEqual([TRACK])
      expect(await upgraded.territories.count()).toBe(1)
      expect(await upgraded.bloodSessions.count()).toBe(0)

      // Old tracks stay « normal »: no kind or colour is invented.
      const [track] = await upgraded.tracks.toArray()
      expect('kind' in track).toBe(false)
      expect('color' in track).toBe(false)

      // Previous indexes still work, new ones are usable.
      expect(await upgraded.waypoints.where('territoryId').equals('terr1').count()).toBe(
        1,
      )
      await upgraded.waypoints.update('w1', { sessionId: 's1' })
      await upgraded.tracks.update('t1', { sessionId: 's1' })
      expect(await upgraded.waypoints.where('sessionId').equals('s1').count()).toBe(1)
      expect(await upgraded.tracks.where('sessionId').equals('s1').count()).toBe(1)
    } finally {
      upgraded.close()
    }
  })
})
