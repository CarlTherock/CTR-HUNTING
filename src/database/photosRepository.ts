import { db } from './db'
import type { Coordinate, Photo } from '@/types'

export interface CreatePhotoInput {
  waypointId: string
  blob: Blob
  /** Defaults to `blob` — a photo with no separate edited version has
   * nothing else to call "original." */
  originalBlob?: Blob
  /** Real GPS at capture time, when the caller has one — never guessed. */
  coordinate?: Coordinate
}

/** Photo CRUD against the local Dexie database — same real
 * offline-read/write pattern as `waypointsRepository`. */
export async function listPhotosForWaypoint(waypointId: string): Promise<Photo[]> {
  return db.photos.where('waypointId').equals(waypointId).toArray()
}

export async function addPhoto(input: CreatePhotoInput): Promise<Photo> {
  const photo: Photo = {
    id: crypto.randomUUID(),
    waypointId: input.waypointId,
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
