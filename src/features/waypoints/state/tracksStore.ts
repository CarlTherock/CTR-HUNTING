import { create } from 'zustand'
import {
  createTrack,
  deleteTrack as deleteTrackRecord,
  listTracks,
  updateTrack as updateTrackRecord,
} from '@/database/tracksRepository'
import {
  getActiveTerritoryId,
  onTerritoryDeleted,
} from '@/features/territories/state/territoriesStore'
import { haversineMeters, totalDistanceBySegments } from '@/utils/geo'
import { DEFAULT_TRIP_COLOR, sanitizeTripColor } from '../trackStyle'
import type { Coordinate, Track, TrackKind, TrackPoint } from '@/types'

export type RecordingStatus = 'idle' | 'recording' | 'paused'

/** GPS samples closer together than this are dropped as jitter, not real
 * movement — a stationary device's fix wanders a few meters on its own,
 * and recording every wobble would make distance/duration meaningless. */
const MIN_POINT_DISTANCE_METERS = 5

/** No GPS reading for this long while recording = an unobserved gap (app in
 * the background, phone locked…): the next point starts a NEW segment, so no
 * line or distance is invented across the gap. */
export const MAX_OBSERVATION_GAP_MS = 120_000

export interface StartTrackOptions {
  kind?: TrackKind
  /** Colour of a normal trip (ignored for blood searches, always red). */
  color?: string
  sessionId?: string
  name?: string
}

interface TracksState {
  tracks: Track[]
  loaded: boolean
  status: RecordingStatus
  recordingId: string | null
  recordingStartedAt: string | null
  points: TrackPoint[]
  /** Indexes in `points` that start a new, unconnected segment. */
  breaks: number[]
  /** Type and colour of the track being recorded. */
  recordingKind: TrackKind
  recordingColor: string
  recordingSessionId: string | null
  distanceMeters: number
  /** Last failure to write the track to the device (storage full, database
   * blocked…), shown to the user until a later write succeeds. While set,
   * recent points may exist only in memory. */
  persistError: string | null

  load: () => Promise<void>
  /** Starts a track. Returns its id, or `null` when one is already being
   * recorded (a second track is never started silently) or creation failed. */
  start: (options?: StartTrackOptions) => Promise<string | null>
  /** Changes the display colour of a NORMAL track; GPS points are untouched
   * and blood searches stay red. */
  setColor: (id: string, color: string) => Promise<void>
  pause: () => void
  resume: () => void
  /** Appends a GPS sample to the in-progress track — a no-op while idle or
   * paused, and while recording, points too close to the last one (see
   * `MIN_POINT_DISTANCE_METERS`) are dropped rather than stored. */
  addPoint: (coordinate: Coordinate) => void
  stop: () => Promise<void>
  deleteTrack: (id: string) => Promise<void>
  /** Renames a track. Returns `false` (and changes nothing) for an empty name. */
  renameTrack: (id: string, name: string) => Promise<boolean>
  /** Files a track in a territory (`undefined` = « Non classé »). Only the
   * folder changes; points and times are untouched. */
  setTerritory: (id: string, territoryId: string | undefined) => Promise<void>
  /** Continues recording into a track that was cut short (app closed, phone
   * locked, crash). The straight line across the gap is NOT real movement. */
  resumeInterrupted: (id: string) => void
  /** Closes a track that was cut short, ending it at its last real point. */
  finishInterrupted: (id: string) => Promise<void>
  /** Forces a write of the in-progress track (e.g. before the page hides). */
  flush: () => Promise<void>
}

/** A track with no end time that is not the one being recorded right now
 * was cut short — the app was closed or the device locked mid-recording. */
export function isInterruptedTrack(track: Track, recordingId: string | null): boolean {
  return track.endedAt === undefined && track.id !== recordingId
}

const MAX_NAME_LENGTH = 80

function describeError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return 'espace de stockage de l’appareil plein'
  }
  return error instanceof Error && error.message ? error.message : 'erreur inconnue'
}

let nextDefaultNumber = 1

// Writes are coalesced: while one is in flight, further points only mark the
// track dirty and a single follow-up write saves the latest state. This keeps
// writes ordered (an older snapshot can never overwrite a newer one) without
// rewriting the whole track once per GPS fix.
let persistInFlight: Promise<void> | null = null
let persistDirty = false

/** The next accepted point starts a new segment (after a pause/interruption). */
let pendingBreak = false
/** Wall-clock time of the last GPS reading received while recording. */
let lastObservedAt: number | null = null
let startInFlight = false

export const useTracksStore = create<TracksState>((set, get) => {
  function persistCurrent(): Promise<void> {
    persistDirty = true
    if (persistInFlight) return persistInFlight
    persistInFlight = (async () => {
      try {
        while (persistDirty) {
          persistDirty = false
          const { recordingId, points, distanceMeters, breaks } = get()
          if (!recordingId) break
          await updateTrackRecord(recordingId, { points, distanceMeters, breaks })
          set({ persistError: null })
        }
      } catch (error) {
        set({
          persistError: `Trace non enregistrée sur l’appareil : ${describeError(error)}.`,
        })
      } finally {
        persistInFlight = null
      }
    })()
    return persistInFlight
  }

  return {
    tracks: [],
    loaded: false,
    status: 'idle',
    recordingId: null,
    recordingStartedAt: null,
    points: [],
    breaks: [],
    recordingKind: 'normal',
    recordingColor: DEFAULT_TRIP_COLOR,
    recordingSessionId: null,
    distanceMeters: 0,
    persistError: null,

    load: async () => {
      const tracks = await listTracks()
      nextDefaultNumber = tracks.length + 1
      set({ tracks, loaded: true })
    },

    start: async (options = {}) => {
      // One recording at a time: never start a second track silently.
      if (get().status !== 'idle' || startInFlight) return null
      startInFlight = true
      const startedAt = new Date().toISOString()
      const kind: TrackKind = options.kind === 'blood' ? 'blood' : 'normal'
      const color = kind === 'blood' ? undefined : sanitizeTripColor(options.color)
      try {
        const track = await createTrack({
          name:
            options.name?.trim().slice(0, MAX_NAME_LENGTH) ||
            (kind === 'blood'
              ? `Recherche ${nextDefaultNumber++}`
              : `Trace ${nextDefaultNumber++}`),
          startedAt,
          // New tracks go in the territory the user is working in, if any.
          territoryId: getActiveTerritoryId(),
          kind,
          color,
          sessionId: options.sessionId,
        })
        lastObservedAt = null
        set((state) => ({
          status: 'recording',
          recordingId: track.id,
          recordingStartedAt: startedAt,
          points: [],
          breaks: [],
          recordingKind: kind,
          recordingColor: color ?? DEFAULT_TRIP_COLOR,
          recordingSessionId: options.sessionId ?? null,
          distanceMeters: 0,
          persistError: null,
          tracks: [...state.tracks, track],
        }))
        pendingBreak = false
        return track.id
      } catch (error) {
        // Never record a track that could not even be created on the device.
        set({
          persistError: `Impossible de démarrer l’enregistrement : ${describeError(error)}.`,
        })
        return null
      } finally {
        startInFlight = false
      }
    },

    setColor: async (id, color) => {
      const track = get().tracks.find((t) => t.id === id)
      if (!track || track.kind === 'blood') return
      const next = sanitizeTripColor(color)
      await updateTrackRecord(id, { color: next })
      set((state) => ({
        tracks: state.tracks.map((t) => (t.id === id ? { ...t, color: next } : t)),
        recordingColor: state.recordingId === id ? next : state.recordingColor,
      }))
    },

    pause: () => {
      if (get().status === 'recording') set({ status: 'paused' })
    },

    resume: () => {
      if (get().status === 'paused') {
        // What happened during the pause was not recorded: the next point
        // starts a new segment instead of being linked to the last one.
        pendingBreak = true
        lastObservedAt = null
        set({ status: 'recording' })
      }
    },

    addPoint: (coordinate) => {
      const { status, points, recordingId } = get()
      if (status !== 'recording' || !recordingId) return

      const now = Date.now()
      if (lastObservedAt !== null && now - lastObservedAt > MAX_OBSERVATION_GAP_MS) {
        pendingBreak = true
      }
      lastObservedAt = now

      const last = points.at(-1)
      if (
        !pendingBreak &&
        last &&
        haversineMeters(last, coordinate) < MIN_POINT_DISTANCE_METERS
      ) {
        return
      }

      const point: TrackPoint = { ...coordinate, timestamp: new Date(now).toISOString() }
      const nextPoints = [...points, point]
      let { breaks } = get()
      if (pendingBreak && points.length > 0) breaks = [...breaks, points.length]
      pendingBreak = false
      set({
        points: nextPoints,
        breaks,
        distanceMeters: totalDistanceBySegments(nextPoints, breaks),
      })
      void persistCurrent()
    },

    stop: async () => {
      const { recordingId } = get()
      if (!recordingId) return

      await persistInFlight
      const { points, distanceMeters, breaks } = get()
      const endedAt = new Date().toISOString()
      try {
        await updateTrackRecord(recordingId, { points, distanceMeters, endedAt, breaks })
      } catch (error) {
        // Keep recording state so nothing in memory is lost and the user can retry.
        set({
          persistError: `Trace non enregistrée sur l’appareil : ${describeError(error)}.`,
        })
        return
      }
      set((state) => ({
        status: 'idle',
        recordingId: null,
        recordingStartedAt: null,
        points: [],
        breaks: [],
        recordingSessionId: null,
        distanceMeters: 0,
        persistError: null,
        tracks: state.tracks.map((t) =>
          t.id === recordingId ? { ...t, points, distanceMeters, endedAt, breaks } : t,
        ),
      }))
    },

    deleteTrack: async (id) => {
      await deleteTrackRecord(id)
      set((state) => ({
        tracks: state.tracks.filter((t) => t.id !== id),
        ...(state.recordingId === id
          ? {
              status: 'idle' as const,
              recordingId: null,
              recordingStartedAt: null,
              points: [],
              breaks: [],
              recordingSessionId: null,
              distanceMeters: 0,
            }
          : {}),
      }))
    },

    renameTrack: async (id, name) => {
      const trimmed = name.trim().slice(0, MAX_NAME_LENGTH)
      if (!trimmed) return false
      await updateTrackRecord(id, { name: trimmed })
      set((state) => ({
        tracks: state.tracks.map((t) => (t.id === id ? { ...t, name: trimmed } : t)),
      }))
      return true
    },

    setTerritory: async (id, territoryId) => {
      // `undefined` removes the field in Dexie (back to « Non classé »).
      await updateTrackRecord(id, { territoryId })
      set((state) => ({
        tracks: state.tracks.map((t) => {
          if (t.id !== id) return t
          const updated = { ...t, territoryId }
          if (territoryId === undefined) delete updated.territoryId
          return updated
        }),
      }))
    },

    resumeInterrupted: (id) => {
      const { status, tracks } = get()
      const track = tracks.find((t) => t.id === id)
      if (status !== 'idle' || !track || !isInterruptedTrack(track, null)) return
      // The time between the cut and now was not observed: the next point
      // starts a new segment (no straight line across the gap).
      pendingBreak = true
      lastObservedAt = null
      const kind: TrackKind = track.kind === 'blood' ? 'blood' : 'normal'
      const breaks = track.breaks ?? []
      set({
        status: 'recording',
        recordingId: track.id,
        recordingStartedAt: track.startedAt,
        points: track.points,
        breaks,
        recordingKind: kind,
        recordingColor:
          kind === 'blood' ? DEFAULT_TRIP_COLOR : sanitizeTripColor(track.color),
        recordingSessionId: track.sessionId ?? null,
        distanceMeters:
          track.distanceMeters ?? totalDistanceBySegments(track.points, breaks),
        persistError: null,
      })
    },

    finishInterrupted: async (id) => {
      const track = get().tracks.find((t) => t.id === id)
      if (!track || !isInterruptedTrack(track, get().recordingId)) return
      // End at the last real fix; never invent an end time later than the data.
      const endedAt = track.points.at(-1)?.timestamp ?? track.startedAt
      const distanceMeters =
        track.distanceMeters ?? totalDistanceBySegments(track.points, track.breaks)
      await updateTrackRecord(id, { endedAt, distanceMeters })
      set((state) => ({
        tracks: state.tracks.map((t) =>
          t.id === id ? { ...t, endedAt, distanceMeters } : t,
        ),
      }))
    },

    flush: async () => {
      if (get().recordingId) await persistCurrent()
    },
  }
})

// A deleted territory's tracks were moved to « Non classé » in the database;
// mirror that in memory without touching the recording state.
onTerritoryDeleted((territoryId) => {
  useTracksStore.setState((state) => ({
    tracks: state.tracks.map((t) => {
      if (t.territoryId !== territoryId) return t
      const released = { ...t }
      delete released.territoryId
      return released
    }),
  }))
})
