import { db } from './db'

/**
 * Total deletion of what this app stores in IndexedDB.
 *
 * Safety properties (tested in `wipeRepository.test.ts`):
 *  - nothing here runs by itself: only the confirmed « Supprimer mes données »
 *    flow calls `deleteAllLocalData`;
 *  - every table of the database is cleared inside ONE read-write
 *    transaction, so it is all-or-nothing: if any clear fails, the
 *    transaction aborts and no table loses a single record;
 *  - the list of tables comes from the database itself (`db.tables`), so a
 *    table added later is covered without touching this file.
 *
 * The map-tile caches (Cache Storage) are not transactional and are removed
 * afterwards by `clearOfflineCaches`; see the deletion store for the order.
 */
export interface LocalDataSummary {
  waypoints: number
  tracks: number
  observations: number
  photos: number
  territories: number
  offlineAreas: number
  /** Preferences, caches of the last forecast, reminders… (the `settings` table). */
  settings: number
}

export async function summarizeLocalData(): Promise<LocalDataSummary> {
  const [waypoints, tracks, observations, photos, territories, offlineAreas, settings] =
    await Promise.all([
      db.waypoints.count(),
      db.tracks.count(),
      db.observations.count(),
      db.photos.count(),
      db.territories.count(),
      db.offlineAreas.count(),
      db.settings.count(),
    ])
  return { waypoints, tracks, observations, photos, territories, offlineAreas, settings }
}

/** Clears every table in a single transaction (all or nothing). */
export async function deleteAllLocalData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      await table.clear()
    }
  })
}
