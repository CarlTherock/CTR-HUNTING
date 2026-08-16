import Dexie, { type EntityTable } from 'dexie'
import type { Waypoint, Track, Observation } from '@/types'

/**
 * Local-first persistence layer (IndexedDB via Dexie).
 *
 * This is the foundation of the offline architecture required from Phase 0
 * onward: the app must keep working — and keep the user's data — with no
 * network at all. Feature phases (Waypoints in Phase 2, Offline map tiles in
 * Phase 3, Journal in Phase 13, ...) add tables and repositories on top of
 * this database; they do not replace it.
 *
 * A `settings` key/value table is included now because the app shell
 * (theme, last-selected base layer, onboarding state, etc.) needs somewhere
 * durable to read/write from immediately, without waiting for a specific
 * feature phase.
 */
export interface SettingRecord {
  key: string
  value: unknown
}

export interface SyncQueueRecord {
  id: string
  entity: 'waypoint' | 'track' | 'observation'
  entityId: string
  operation: 'create' | 'update' | 'delete'
  queuedAt: string // ISO 8601
}

export class FieldTerrainDatabase extends Dexie {
  waypoints!: EntityTable<Waypoint, 'id'>
  tracks!: EntityTable<Track, 'id'>
  observations!: EntityTable<Observation, 'id'>
  settings!: EntityTable<SettingRecord, 'key'>
  /** Pending changes to push once connectivity returns (Phase 15 — Sync). */
  syncQueue!: EntityTable<SyncQueueRecord, 'id'>

  constructor() {
    super('field-terrain-intelligence')

    this.version(1).stores({
      waypoints: 'id, category, createdAt',
      tracks: 'id, startedAt',
      observations: 'id, waypointId, timestamp',
      settings: 'key',
      syncQueue: 'id, entity, entityId, queuedAt',
    })
  }
}

export const db = new FieldTerrainDatabase()
