import { db } from './db'
import { deletePhotosForObservation } from './photosRepository'
import type {
  ConditionsMeta,
  Coordinate,
  DeerEntry,
  Observation,
  PositionOrigin,
  ShotRecord,
} from '@/types'

export interface CreateObservationInput {
  coordinate: Coordinate
  notes: string
  waypointId?: string
  territoryId?: string
  conditions?: Observation['conditions']
  conditionsMeta?: ConditionsMeta
  /** When it was observed (defaults to now). */
  observedAt?: string
  positionOrigin?: PositionOrigin
  deer?: DeerEntry
  species?: 'moose'
  shot?: ShotRecord
  trackId?: string
}

export type UpdateObservationInput = Partial<
  Pick<
    Observation,
    | 'notes'
    | 'photoIds'
    | 'waypointId'
    | 'conditions'
    | 'conditionsMeta'
    | 'territoryId'
    | 'timestamp'
    | 'deer'
    | 'shot'
    | 'trackId'
  >
>

/** Observation (Phase 13 — Journal) CRUD against the local Dexie
 * database — same real offline read/write pattern as
 * `waypointsRepository`. */
export async function listObservations(): Promise<Observation[]> {
  return db.observations.toArray()
}

export async function createObservation(
  input: CreateObservationInput,
): Promise<Observation> {
  const now = new Date().toISOString()
  const observation: Observation = {
    id: crypto.randomUUID(),
    coordinate: input.coordinate,
    timestamp: input.observedAt ?? now,
    notes: input.notes,
    waypointId: input.waypointId,
    territoryId: input.territoryId,
    conditions: input.conditions,
    createdAt: now,
  }
  // Optional fields are only written when given, so a plain journal entry keeps
  // exactly the shape it always had.
  if (input.conditionsMeta) observation.conditionsMeta = input.conditionsMeta
  if (input.positionOrigin) observation.positionOrigin = input.positionOrigin
  if (input.deer) observation.deer = input.deer
  if (input.species) observation.species = input.species
  if (input.shot) observation.shot = input.shot
  if (input.trackId) observation.trackId = input.trackId
  await db.observations.add(observation)
  return observation
}

export async function updateObservation(
  id: string,
  patch: UpdateObservationInput,
): Promise<void> {
  await db.observations.update(id, patch)
}

export async function deleteObservation(id: string): Promise<void> {
  await db.observations.delete(id)
  // Without this, an observation's photos would be orphaned in Dexie
  // forever — nothing else references them (same concern as
  // `deletePhotosForWaypoint`).
  await deletePhotosForObservation(id)
}
