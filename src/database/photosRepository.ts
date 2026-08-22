import { db } from './db'
import type { Coordinate, Photo } from '@/types'

interface BasePhotoInput {
  blob: Blob
  /** Defaults to `blob` — a photo with no separate edited version has
   * nothing else to call "original." */
  originalBlob?: Blob
  /** Real GPS at capture time, when the caller has one — never guessed. */
  coordinate?: Coordinate
}

export type CreatePhotoInput =
  | (BasePhotoInput & { waypointId: string; observationId?: never })
  | (BasePhotoInput & { observationId: string; waypointId?: never })

/** Photo CRUD against the local Dexie database — same real
 * offline-read/write pattern as `waypointsRepository`. A photo belongs
 * to exactly one owner (a waypoint, Phase 2, or an observation, Phase
 * 13) — never both. */
export async function listPhotosForWaypoint(waypointId: string): Promise<Photo[]> {
  return db.photos.where('waypointId').equals(waypointId).toArray()
}

export async function listPhotosForObservation(observationId: string): Promise<Photo[]> {
  return db.photos.where('observationId').equals(observationId).toArray()
}

export async function addPhoto(input: CreatePhotoInput): Promise<Photo> {
  const photo: Photo = {
    id: crypto.randomUUID(),
    waypointId: input.waypointId,
    observationId: input.observationId,
    blob: input.blob,
    originalBlob: input.originalBlob ?? input.blob,
    coordinate: input.coordinate,
    createdAt: new Date().toISOString(),
  }
  await db.photos.add(photo)
  return photo
}

export async function deletePhoto(id: string): Promise<void> {
  await db.photos.delete(id)
}

/** Called when a waypoint itself is deleted — without this, its photos
 * would be orphaned in Dexie forever (nothing else references them). */
export async function deletePhotosForWaypoint(waypointId: string): Promise<void> {
  await db.photos.where('waypointId').equals(waypointId).delete()
}

/** Called when an observation itself is deleted — same orphaning concern
 * as `deletePhotosForWaypoint`. */
export async function deletePhotosForObservation(observationId: string): Promise<void> {
  await db.photos.where('observationId').equals(observationId).delete()
}
