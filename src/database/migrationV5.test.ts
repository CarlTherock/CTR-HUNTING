import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FieldTerrainDatabase } from './db'

const DB_NAME = 'field-terrain-intelligence'

/** The schema exactly as shipped up to version 4 (before territories).
 * Declared independently of `db.ts` on purpose: the test must open a REAL
 * version-4 database, then let the current code upgrade it. */
function openVersion4(): Dexie {
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
  legacy.version(4).stores({
    photos: 'id, waypointId, observationId, createdAt',
  })
  return legacy
}

const WAYPOINT = {
  id: 'w1',
  name: 'Poste du ruisseau',
  coordinate: { lat: 46.8123, lng: -71.2045 },
  category: 'stand_blind',
  color: '#3b82f6',
  notes: 'Vent du nord',
  photoIds: ['p1'],
  optimalWindDirections: [0, 45],
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-02T10:00:00.000Z',
}
const TRACK = {
  id: 't1',
  name: 'Crête nord',
  points: [
    { lat: 46.8, lng: -71.2, timestamp: '2026-08-16T10:00:05.000Z' },
    { lat: 46.801, lng: -71.2, timestamp: '2026-08-16T10:00:35.000Z' },
  ],
  startedAt: '2026-08-16T10:00:00.000Z',
  endedAt: '2026-08-16T10:30:00.000Z',
  distanceMeters: 111,
}
const OBSERVATION = {
  id: 'o1',
  coordinate: { lat: 46.8, lng: -71.2 },
  timestamp: '2026-08-17T07:00:00.000Z',
  notes: 'Traces fraîches',
  photoIds: ['p2'],
  waypointId: 'w1',
  conditions: {
    temperatureCelsius: 4,
    windSpeedKmh: 8,
    windDirectionDegrees: 315,
    cloudCoverPercent: 20,
  },
}
const PHOTO = {
  id: 'p1',
  waypointId: 'w1',
  blob: new Blob(['x'], { type: 'image/jpeg' }),
  createdAt: '2026-08-02T10:00:00.000Z',
}

describe('Dexie migration v4 -> v5 (territories)', () => {
  beforeEach(async () => {
    await Dexie.delete(DB_NAME)
  })
  afterEach(async () => {
    await Dexie.delete(DB_NAME)
  })

  it('keeps every existing record intact and unclassified', async () => {
    const legacy = openVersion4()
    await legacy.open()
    expect(legacy.verno).toBe(4)
    await legacy.table('waypoints').add(WAYPOINT)
    await legacy.table('tracks').add(TRACK)
    await legacy.table('observations').add(OBSERVATION)
    await legacy.table('photos').add(PHOTO)
    await legacy.table('settings').put({ key: 'fieldModeEnabled', value: true })
    await legacy.table('syncQueue').add({
      id: 'q1',
      entity: 'waypoint',
      entityId: 'w1',
      operation: 'create',
      queuedAt: '2026-08-02T10:00:00.000Z',
    })
    await legacy
      .table('offlineAreas')
      .add({ id: 'a1', status: 'complete', createdAt: '2026-08-03T10:00:00.000Z' })
    legacy.close()

    const upgraded = new FieldTerrainDatabase()
    await upgraded.open()
    try {
      // The current schema is v6 (blood-search sessions, additive on top of v5).
      expect(upgraded.verno).toBe(6)

      // Records come back byte-for-byte as stored: no territoryId invented,
      // no field dropped or rewritten.
      expect(await upgraded.waypoints.toArray()).toEqual([WAYPOINT])
      expect(await upgraded.tracks.toArray()).toEqual([TRACK])
      expect(await upgraded.observations.toArray()).toEqual([OBSERVATION])
      const [photo] = await upgraded.photos.toArray()
      expect(photo.id).toBe('p1')
      expect(photo.waypointId).toBe('w1')
      expect(await upgraded.settings.get('fieldModeEnabled')).toEqual({
        key: 'fieldModeEnabled',
        value: true,
      })
      expect(await upgraded.syncQueue.count()).toBe(1)
      expect(await upgraded.offlineAreas.count()).toBe(1)

      // New table exists and starts empty.
      expect(await upgraded.territories.count()).toBe(0)

      // Existing records are « Non classé » (no territoryId) ...
      expect(await upgraded.waypoints.where('territoryId').equals('x').count()).toBe(0)
      const [waypoint] = await upgraded.waypoints.toArray()
      expect('territoryId' in waypoint).toBe(false)

      // ... and the previous indexes still work.
      expect(
        await upgraded.waypoints.where('category').equals('stand_blind').count(),
      ).toBe(1)
      expect(await upgraded.observations.where('waypointId').equals('w1').count()).toBe(1)
      expect(
        await upgraded.tracks.where('startedAt').equals(TRACK.startedAt).count(),
      ).toBe(1)
      expect(await upgraded.photos.where('waypointId').equals('w1').count()).toBe(1)

      // The new indexes are usable on migrated data.
      await upgraded.territories.add({
        id: 'terr1',
        name: 'Secteur nord',
        createdAt: '2026-10-07T10:00:00.000Z',
        updatedAt: '2026-10-07T10:00:00.000Z',
      })
      await upgraded.waypoints.update('w1', { territoryId: 'terr1' })
      await upgraded.tracks.update('t1', { territoryId: 'terr1' })
      await upgraded.observations.update('o1', { territoryId: 'terr1' })
      expect(await upgraded.waypoints.where('territoryId').equals('terr1').count()).toBe(
        1,
      )
      expect(await upgraded.tracks.where('territoryId').equals('terr1').count()).toBe(1)
      expect(
        await upgraded.observations.where('territoryId').equals('terr1').count(),
      ).toBe(1)
      // Coordinates untouched by the assignment.
      expect((await upgraded.waypoints.get('w1'))?.coordinate).toEqual(
        WAYPOINT.coordinate,
      )
    } finally {
      upgraded.close()
    }
  })

  it('opens an empty database directly at version 6 (current schema)', async () => {
    const fresh = new FieldTerrainDatabase()
    await fresh.open()
    try {
      expect(fresh.verno).toBe(6)
      expect(fresh.tables.map((t) => t.name)).toContain('territories')
      expect(fresh.table('waypoints').schema.idxByName.territoryId).toBeDefined()
      expect(fresh.table('tracks').schema.idxByName.territoryId).toBeDefined()
      expect(fresh.table('observations').schema.idxByName.territoryId).toBeDefined()
    } finally {
      fresh.close()
    }
  })
})
