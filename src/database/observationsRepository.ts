import { db } from './db'
import { deletePhotosForObservation } from './photosRepository'
import type { Coordinate, Observation } from '@/types'

export interface CreateObservationInput {
  coordinate: Coordinate
  notes: string
  waypointId?: string
  conditions?: Observation['conditions']
}

export type UpdateObservationInput = Partial<
  Pick<Observation, 'notes' | 'photoIds' | 'waypointId' | 'conditions'>
>

/** Observation (Phase 13 — Journal) CRUD against the local Dexie
 * database — same real offline read/write pattern as
 * `waypointsRepository`. */
export async function listObservations(): Promise<Observation[]> {
  return db.observations.toArray()
}

export async function createObservation(input: CreateObservationInput): Promise<Observation> {
  const observation: Observation = {
    id: crypto.randomUUID(),
    coordinate: input.coordinate,
    timestamp: new Date().toISOString(),
    notes: input.notes,
    waypointId: input.waypointId,
    conditions: input.conditions,
  }
  await db.observations.add(observation)
  return observation
}

export async function updateObservation(id: string, patch: UpdateObservationInput): Promise<void> {
  await db.observations.update(id, patch)
}

export async function deleteObservation(id: string): Promise<void> {
  await db.observations.delete(id)
  // Without this, an observation's photos would be orphaned in Dexie
  // forever — nothing else references them (same concern as
  // `deletePhotosForWaypoint`).
  await deletePhotosForObservation(id)
}
