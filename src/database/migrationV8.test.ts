import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FieldTerrainDatabase } from './db'

const DB_NAME = 'field-terrain-intelligence'

/** Schéma tel que livré à la version 7, déclaré indépendamment de `db.ts`. */
function openVersion7(): Dexie {
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
  legacy.version(6).stores({
    bloodSessions: 'id, status, createdAt, territoryId',
    waypoints: 'id, category, createdAt, territoryId, sessionId',
    tracks: 'id, startedAt, territoryId, sessionId',
  })
  legacy.version(7).stores({ savedForecasts: 'id, fetchedAt' })
  return legacy
}

const WAYPOINT = {
  id: 'w1',
  name: 'Poste',
  coordinate: { lat: 46.8, lng: -71.2 },
  category: 'stand_blind',
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
}

describe('migration Dexie v7 -> v8 (analyses « Où et quand chasser »)', () => {
  beforeEach(async () => {
    await Dexie.delete(DB_NAME)
  })
  afterEach(async () => {
    await Dexie.delete(DB_NAME)
  })

  it('conserve les données existantes et ajoute une table vide', async () => {
    const legacy = openVersion7()
    await legacy.open()
    await legacy.table('waypoints').add(WAYPOINT)
    await legacy
      .table('savedForecasts')
      .add({ id: 'f1', fetchedAt: '2026-11-01T00:00:00Z' })
    legacy.close()

    const upgraded = new FieldTerrainDatabase()
    await upgraded.open()
    try {
      expect(upgraded.verno).toBe(8)
      expect(await upgraded.waypoints.toArray()).toEqual([WAYPOINT])
      expect(await upgraded.savedForecasts.count()).toBe(1)
      expect(await upgraded.huntAnalyses.count()).toBe(0)
    } finally {
      upgraded.close()
    }
  })
})
