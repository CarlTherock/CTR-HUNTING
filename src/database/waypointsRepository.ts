import { db } from './db'
import type { Coordinate, Waypoint, WaypointCategory } from '@/types'

export interface CreateWaypointInput {
  name: string
  coordinate: Coordinate
  category: WaypointCategory
  notes?: string
}

export type UpdateWaypointInput = Partial<
  Pick<
    Waypoint,
    'name' | 'category' | 'color' | 'notes' | 'coordinate' | 'photoIds' | 'optimalWindDirections'
  >
>

/** Waypoint CRUD against the local Dexie database — real offline
 * read/write, no mocking, matching `settingsRepository`'s pattern. */
export async function listWaypoints(): Promise<Waypoint[]> {
  return db.waypoints.toArray()
}

export async function createWaypoint(input: CreateWaypointInput): Promise<Waypoint> {
  const now = new Date().toISOString()
  const waypoint: Waypoint = {
    id: crypto.randomUUID(),
    name: input.name,
    coordinate: input.coordinate,
    category: input.category,
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
  }
  await db.waypoints.add(waypoint)
  return waypoint
}

export async function updateWaypoint(id: string, patch: UpdateWaypointInput): Promise<void> {
  await db.waypoints.update(id, { ...patch, updatedAt: new Date().toISOString() })
}

export async function deleteWaypoint(id: string): Promise<void> {
  await db.waypoints.delete(id)
}
