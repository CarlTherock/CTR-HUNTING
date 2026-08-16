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
}

let nextDefaultNumber = 1

export const useTracksStore = create<TracksState>((set, get) => ({
  tracks: [],
  loaded: false,
  status: 'idle',
  recordingId: null,
  recordingStartedAt: null,
  points: [],
  distanceMeters: 0,

  load: async () => {
    const tracks = await listTracks()
    nextDefaultNumber = tracks.length + 1
    set({ tracks, loaded: true })
  },

  start: async () => {
    const startedAt = new Date().toISOString()
    const track = await createTrack({ name: `Track ${nextDefaultNumber++}`, startedAt })
    set((state) => ({
      status: 'recording',
      recordingId: track.id,
      recordingStartedAt: startedAt,
      points: [],
      distanceMeters: 0,
      tracks: [...state.tracks, track],
    }))
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
    const distanceMeters = totalDistanceMeters(nextPoints)
    set({ points: nextPoints, distanceMeters })
    void updateTrackRecord(recordingId, { points: nextPoints, distanceMeters })
  },

  stop: async () => {
    const { recordingId, points, distanceMeters } = get()
    if (!recordingId) return

    const endedAt = new Date().toISOString()
    await updateTrackRecord(recordingId, { points, distanceMeters, endedAt })
    set((state) => ({
      status: 'idle',
      recordingId: null,
      recordingStartedAt: null,
      points: [],
      distanceMeters: 0,
      tracks: state.tracks.map((t) => (t.id === recordingId ? { ...t, points, distanceMeters, endedAt } : t)),
    }))
  },

  deleteTrack: async (id) => {
    await deleteTrackRecord(id)
    set((state) => ({
      tracks: state.tracks.filter((t) => t.id !== id),
      ...(state.recordingId === id
        ? { status: 'idle' as const, recordingId: null, recordingStartedAt: null, points: [], distanceMeters: 0 }
        : {}),
    }))
  },
}))
