import { create } from 'zustand'
import {
  createTrack,
  deleteTrack as deleteTrackRecord,
  listTracks,
  updateTrack as updateTrackRecord,
} from '@/database/tracksRepository'
import { haversineMeters, totalDistanceMeters } from '@/utils/geo'
import type { Coordinate, Track, TrackPoint } from '@/types'

export type RecordingStatus = 'idle' | 'recording' | 'paused'

/** GPS samples closer together than this are dropped as jitter, not real
 * movement — a stationary device's fix wanders a few meters on its own,
 * and recording every wobble would make distance/duration meaningless. */
const MIN_POINT_DISTANCE_METERS = 5

interface TracksState {
  tracks: Track[]
  loaded: boolean
  status: RecordingStatus
  recordingId: string | null
  recordingStartedAt: string | null
  points: TrackPoint[]
  distanceMeters: number
  /** Last failure to write the track to the device (storage full, database
   * blocked…), shown to the user until a later write succeeds. While set,
   * recent points may exist only in memory. */
  persistError: string | null

  load: () => Promise<void>
  start: () => Promise<void>
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

export const useTracksStore = create<TracksState>((set, get) => {
  function persistCurrent(): Promise<void> {
    persistDirty = true
    if (persistInFlight) return persistInFlight
    persistInFlight = (async () => {
      try {
        while (persistDirty) {
          persistDirty = false
          const { recordingId, points, distanceMeters } = get()
          if (!recordingId) break
          await updateTrackRecord(recordingId, { points, distanceMeters })
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
    distanceMeters: 0,
    persistError: null,

    load: async () => {
      const tracks = await listTracks()
      nextDefaultNumber = tracks.length + 1
      set({ tracks, loaded: true })
    },

    start: async () => {
      const startedAt = new Date().toISOString()
      try {
        const track = await createTrack({
          name: `Trace ${nextDefaultNumber++}`,
          startedAt,
        })
        set((state) => ({
          status: 'recording',
          recordingId: track.id,
          recordingStartedAt: startedAt,
          points: [],
          distanceMeters: 0,
          persistError: null,
          tracks: [...state.tracks, track],
        }))
      } catch (error) {
        // Never record a track that could not even be created on the device.
        set({
          persistError: `Impossible de démarrer l’enregistrement : ${describeError(error)}.`,
        })
      }
    },

    pause: () => {
      if (get().status === 'recording') set({ status: 'paused' })
    },

    resume: () => {
      if (get().status === 'paused') set({ status: 'recording' })
    },

    addPoint: (coordinate) => {
      const { status, points, recordingId } = get()
      if (status !== 'recording' || !recordingId) return

      const last = points.at(-1)
      if (last && haversineMeters(last, coordinate) < MIN_POINT_DISTANCE_METERS) return

      const point: TrackPoint = { ...coordinate, timestamp: new Date().toISOString() }
      const nextPoints = [...points, point]
      set({ points: nextPoints, distanceMeters: totalDistanceMeters(nextPoints) })
      void persistCurrent()
    },

    stop: async () => {
      const { recordingId } = get()
      if (!recordingId) return

      await persistInFlight
      const { points, distanceMeters } = get()
      const endedAt = new Date().toISOString()
      try {
        await updateTrackRecord(recordingId, { points, distanceMeters, endedAt })
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
        distanceMeters: 0,
        persistError: null,
        tracks: state.tracks.map((t) =>
          t.id === recordingId ? { ...t, points, distanceMeters, endedAt } : t,
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

    resumeInterrupted: (id) => {
      const { status, tracks } = get()
      const track = tracks.find((t) => t.id === id)
      if (status !== 'idle' || !track || !isInterruptedTrack(track, null)) return
      set({
        status: 'recording',
        recordingId: track.id,
        recordingStartedAt: track.startedAt,
        points: track.points,
        distanceMeters: track.distanceMeters ?? totalDistanceMeters(track.points),
        persistError: null,
      })
    },

    finishInterrupted: async (id) => {
      const track = get().tracks.find((t) => t.id === id)
      if (!track || !isInterruptedTrack(track, get().recordingId)) return
      // End at the last real fix; never invent an end time later than the data.
      const endedAt = track.points.at(-1)?.timestamp ?? track.startedAt
      const distanceMeters = track.distanceMeters ?? totalDistanceMeters(track.points)
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
