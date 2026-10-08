import { db } from './db'
import type { Track } from '@/types'

export interface CreateTrackInput {
  name: string
  startedAt: string
  territoryId?: string
  kind?: Track['kind']
  color?: string
  sessionId?: string
}

export type UpdateTrackInput = Partial<
  Pick<
    Track,
    | 'name'
    | 'points'
    | 'distanceMeters'
    | 'endedAt'
    | 'notes'
    | 'territoryId'
    | 'color'
    | 'breaks'
  >
>

/** Track CRUD against the local Dexie database — same real
 * offline-read/write pattern as `waypointsRepository`. A track is created
 * (empty, `points: []`) the moment recording starts and updated on every
 * accepted GPS sample, not written once at the end — so a crash mid-hunt
 * loses at most the last unsaved sample, not the whole track. */
export async function listTracks(): Promise<Track[]> {
  return db.tracks.toArray()
}

export async function createTrack(input: CreateTrackInput): Promise<Track> {
  const track: Track = {
    id: crypto.randomUUID(),
    name: input.name,
    points: [],
    startedAt: input.startedAt,
    territoryId: input.territoryId,
    ...(input.kind ? { kind: input.kind } : {}),
    ...(input.color ? { color: input.color } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
  }
  await db.tracks.add(track)
  return track
}

export async function updateTrack(id: string, patch: UpdateTrackInput): Promise<void> {
  await db.tracks.update(id, patch)
}

export async function deleteTrack(id: string): Promise<void> {
  await db.tracks.delete(id)
}
