import { db } from './db'
import type { Territory } from '@/types'

export interface CreateTerritoryInput {
  name: string
  notes?: string
}

export type UpdateTerritoryInput = Partial<Pick<Territory, 'name' | 'notes'>>

/** What a territory currently contains. */
export interface TerritoryContents {
  waypoints: number
  tracks: number
  observations: number
}

export function totalContents(contents: TerritoryContents): number {
  return contents.waypoints + contents.tracks + contents.observations
}

/** Territory CRUD against the local Dexie database. A territory is only a
 * logical folder: nothing here touches coordinates or geometry. */
export async function listTerritories(): Promise<Territory[]> {
  return db.territories.toArray()
}

export async function createTerritory(input: CreateTerritoryInput): Promise<Territory> {
  const now = new Date().toISOString()
  const territory: Territory = {
    id: crypto.randomUUID(),
    name: input.name,
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
  }
  await db.territories.add(territory)
  return territory
}

export async function updateTerritory(
  id: string,
  patch: UpdateTerritoryInput,
): Promise<void> {
  await db.territories.update(id, { ...patch, updatedAt: new Date().toISOString() })
}

/** Hides the territory from active pickers. Its content is not touched.
 * Returns the archive timestamp. */
export async function archiveTerritory(id: string): Promise<string> {
  const now = new Date().toISOString()
  await db.territories.update(id, { archivedAt: now, updatedAt: now })
  return now
}

export async function restoreTerritory(id: string): Promise<void> {
  // `undefined` removes the property in Dexie.
  await db.territories.update(id, {
    archivedAt: undefined,
    updatedAt: new Date().toISOString(),
  })
}

export async function countTerritoryContents(id: string): Promise<TerritoryContents> {
  const [waypoints, tracks, observations] = await Promise.all([
    db.waypoints.where('territoryId').equals(id).count(),
    db.tracks.where('territoryId').equals(id).count(),
    db.observations.where('territoryId').equals(id).count(),
  ])
  return { waypoints, tracks, observations }
}

/** Deletes the territory and moves everything it contains to « Non classé »
 * (the `territoryId` field is removed). It never deletes a waypoint, a
 * track or a journal entry, and it is a single transaction: either the
 * folder is gone AND its content is unclassified, or nothing changed.
 * Returns how many items were moved. */
export async function deleteTerritoryKeepingContent(
  id: string,
): Promise<TerritoryContents> {
  return db.transaction(
    'rw',
    [db.territories, db.waypoints, db.tracks, db.observations],
    async () => {
      const release = (item: { territoryId?: string }) => {
        delete item.territoryId
      }
      const waypoints = await db.waypoints.where('territoryId').equals(id).modify(release)
      const tracks = await db.tracks.where('territoryId').equals(id).modify(release)
      const observations = await db.observations
        .where('territoryId')
        .equals(id)
        .modify(release)
      await db.territories.delete(id)
      return { waypoints, tracks, observations }
    },
  )
}
