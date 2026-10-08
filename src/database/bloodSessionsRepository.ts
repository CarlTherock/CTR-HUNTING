import { db } from './db'
import { deletePhotosForWaypoint } from './photosRepository'
import { markerName } from '@/features/blood/sessionLogic'
import type {
  BloodMarkerKind,
  BloodSession,
  BloodSessionStatus,
  Coordinate,
  Waypoint,
} from '@/types'

export async function listBloodSessions(): Promise<BloodSession[]> {
  return db.bloodSessions.toArray()
}

export interface CreateBloodSessionInput {
  name: string
  species?: string
  territoryId?: string
  status?: BloodSessionStatus
}

export async function createBloodSession(
  input: CreateBloodSessionInput,
): Promise<BloodSession> {
  const now = new Date().toISOString()
  const session: BloodSession = {
    id: crypto.randomUUID(),
    name: input.name,
    createdAt: now,
    updatedAt: now,
    status: input.status ?? 'waiting_gps',
    counters: {},
    ...(input.species ? { species: input.species } : {}),
    ...(input.territoryId ? { territoryId: input.territoryId } : {}),
  }
  await db.bloodSessions.add(session)
  return session
}

export type UpdateBloodSessionInput = Partial<
  Pick<
    BloodSession,
    'name' | 'status' | 'startedAt' | 'endedAt' | 'species' | 'trackId' | 'notes'
  > & { territoryId: string | undefined }
>

export async function updateBloodSession(
  id: string,
  patch: UpdateBloodSessionInput,
): Promise<void> {
  await db.bloodSessions.update(id, { ...patch, updatedAt: new Date().toISOString() })
}

export interface AddBloodMarkerInput {
  sessionId: string
  kind: BloodMarkerKind
  coordinate: Coordinate
  origin: 'gps' | 'manual'
}

/** Creates one clue as a REAL waypoint and bumps the session counter in a
 * single transaction: either both are written or neither is, and the number
 * is taken from the stored counter so it can never repeat — not even after
 * a reload, a deletion, or two rapid presses. */
export async function addBloodMarker(input: AddBloodMarkerInput): Promise<Waypoint> {
  return db.transaction('rw', db.bloodSessions, db.waypoints, async () => {
    const session = await db.bloodSessions.get(input.sessionId)
    if (!session) throw new Error('Session de recherche introuvable.')
    const n = (session.counters[input.kind] ?? 0) + 1
    const now = new Date().toISOString()
    const waypoint: Waypoint = {
      id: crypto.randomUUID(),
      name: markerName(input.kind, n),
      coordinate: input.coordinate,
      category: 'blood',
      notes: '',
      sessionId: session.id,
      bloodKind: input.kind,
      origin: input.origin,
      createdAt: now,
      updatedAt: now,
      ...(session.territoryId ? { territoryId: session.territoryId } : {}),
    }
    await db.waypoints.add(waypoint)
    await db.bloodSessions.update(session.id, {
      counters: { ...session.counters, [input.kind]: n },
      updatedAt: now,
    })
    return waypoint
  })
}

/** Counts of what a session owns, to show before a deletion. */
export async function sessionContentCounts(sessionId: string) {
  const waypoints = await db.waypoints.where('sessionId').equals(sessionId).toArray()
  const photos = waypoints.length
    ? await db.photos
        .where('waypointId')
        .anyOf(waypoints.map((w) => w.id))
        .count()
    : 0
  const tracks = await db.tracks.where('sessionId').equals(sessionId).count()
  return { waypoints: waypoints.length, photos, tracks }
}

/** Deletes a session. `deleteContent: false` keeps the track and the clues as
 * ordinary items (only the link to the session is removed); `true` deletes
 * them too, with their photos. Nothing is deleted silently: the caller shows
 * `sessionContentCounts` first. */
export async function deleteBloodSession(
  id: string,
  options: { deleteContent: boolean },
): Promise<void> {
  const waypoints = await db.waypoints.where('sessionId').equals(id).toArray()
  if (options.deleteContent) {
    for (const waypoint of waypoints) await deletePhotosForWaypoint(waypoint.id)
  }
  await db.transaction('rw', db.bloodSessions, db.waypoints, db.tracks, async () => {
    if (options.deleteContent) {
      await db.waypoints.where('sessionId').equals(id).delete()
      await db.tracks.where('sessionId').equals(id).delete()
    } else {
      await db.waypoints
        .where('sessionId')
        .equals(id)
        .modify((w) => {
          delete w.sessionId
        })
      await db.tracks
        .where('sessionId')
        .equals(id)
        .modify((t) => {
          delete t.sessionId
        })
    }
    await db.bloodSessions.delete(id)
  })
}
