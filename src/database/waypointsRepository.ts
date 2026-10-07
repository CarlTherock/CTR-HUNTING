import { db } from './db'
import type { Coordinate, Waypoint, WaypointCategory } from '@/types'

export interface CreateWaypointInput {
  name: string
  coordinate: Coordinate
  category: WaypointCategory
  color?: Waypoint['color']
  notes?: string
  optimalWindDirections?: number[]
}

/** Editable metadata of a saved waypoint. `coordinate` is deliberately absent:
 * a waypoint's position is fixed when it is first saved (to change it, delete
 * the waypoint and create a new one). */
export type UpdateWaypointInput = Partial<
  Pick<
    Waypoint,
    'name' | 'category' | 'color' | 'notes' | 'photoIds' | 'optimalWindDirections'
  >
>

/** Thrown when code tries to change the position of a saved waypoint. */
export class WaypointLockedError extends Error {
  constructor() {
    super(
      'A saved waypoint’s location is locked: delete it and create a new one to move it.',
    )
    this.name = 'WaypointLockedError'
  }
}

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
    color: input.color,
    notes: input.notes,
    optimalWindDirections: input.optimalWindDirections,
    createdAt: now,
    updatedAt: now,
  }
  await db.waypoints.add(waypoint)
  return waypoint
}

export async function updateWaypoint(
  id: string,
  patch: UpdateWaypointInput,
): Promise<void> {
  // The type already forbids it; this protects callers that bypass the type
  // system (casts, untyped data, future code paths).
  if ('coordinate' in patch) throw new WaypointLockedError()
  await db.waypoints.update(id, { ...patch, updatedAt: new Date().toISOString() })
}

export async function deleteWaypoint(id: string): Promise<void> {
  await db.waypoints.delete(id)
}
