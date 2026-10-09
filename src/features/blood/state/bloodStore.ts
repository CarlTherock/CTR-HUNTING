import { create } from 'zustand'
import {
  addBloodMarker,
  createBloodSession,
  deleteBloodSession,
  listBloodSessions,
  sessionContentCounts,
  updateBloodSession,
} from '@/database/bloodSessionsRepository'
import { addPhoto, listPhotosForWaypoint } from '@/database/photosRepository'
import { getActiveTerritoryId } from '@/features/territories/state/territoriesStore'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import type { BloodMarkerKind, BloodSession, Coordinate, Waypoint } from '@/types'
import { isOpenSession } from '../sessionLogic'

export type StartResult =
  | { ok: true; session: BloodSession }
  | { ok: false; reason: 'track-active' | 'session-open' | 'error'; message: string }

export type MarkerResult =
  { ok: true; waypoint: Waypoint } | { ok: false; message: string }

function describeError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'erreur inconnue'
}

interface BloodState {
  sessions: BloodSession[]
  loaded: boolean
  /** Last clue added in this app run, for « Annuler le dernier ajout ». */
  lastAddedId: string | null
  /** Optional dashed links between consecutive clues. */
  showLinks: boolean
  /** Manual placement in progress (no usable GPS): the point is only saved
   * once the user confirms. */
  manual: { kind: BloodMarkerKind; coordinate: Coordinate | null; note?: string } | null
  startManual: (kind: BloodMarkerKind, note?: string) => void
  setManualCoordinate: (coordinate: Coordinate) => void
  cancelManual: () => void
  /** Saves the manually placed point. */
  confirmManual: () => Promise<MarkerResult>

  /** The blood camera is opened from several places (map « + Repère », Outils,
   * the search panel, the searches page): one flag, one component. It never
   * needs an open search. */
  cameraOpen: boolean
  openCamera: () => void
  closeCamera: () => void

  load: () => Promise<void>
  /** The session that is not finished, if any (at most one at a time). */
  openSession: () => BloodSession | null
  /** Starts a session. With `hasUsableFix` the red track starts at once;
   * otherwise the session waits (« En attente du GPS ») and records nothing. */
  startSession: (options: {
    name?: string
    species?: string
    hasUsableFix: boolean
  }) => Promise<StartResult>
  /** Called when a usable fix arrives: starts the recording of a session that
   * was waiting. Waiting time is not movement; no point is invented. */
  onUsableFix: () => Promise<void>
  /** Cancels a session still waiting for GPS (nothing recorded). */
  cancelWaiting: (id: string) => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  /** Finishes the session; nothing is deleted. */
  finish: (id?: string) => Promise<void>
  /** Continues a session whose track was cut short (app closed…). */
  resumeInterrupted: (id: string) => Promise<void>
  addMarker: (
    kind: BloodMarkerKind,
    position: { coordinate: Coordinate; origin: 'gps' | 'manual' },
  ) => Promise<MarkerResult>
  /** What « Annuler le dernier ajout » would delete, with a warning flag when
   * notes or photos were added since. */
  undoInfo: () => Promise<{ waypoint: Waypoint; hasExtras: boolean } | null>
  undoLast: () => Promise<boolean>
  rename: (id: string, name: string) => Promise<boolean>
  setShowLinks: (value: boolean) => void
  deleteSession: (id: string, deleteContent: boolean) => Promise<void>
  /** Adds an optional note and/or photo (processed + untouched original) to a
   * clue that was just saved. The clue itself is already safe: a failure here
   * is reported and never removes it. */
  attachClueMedia: (
    waypointId: string,
    media: {
      note?: string
      photo?: { processed: Blob; original: Blob; coordinate?: Coordinate }
    },
  ) => Promise<boolean>
  /** What a deletion would affect (points, photos, traces), to show first. */
  contentCounts: (
    id: string,
  ) => Promise<{ waypoints: number; photos: number; tracks: number }>
}

export const useBloodStore = create<BloodState>((set, get) => {
  function patchSession(id: string, patch: Partial<BloodSession>) {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s,
      ),
    }))
  }

  async function beginRecording(session: BloodSession): Promise<boolean> {
    const trackId = await useTracksStore.getState().start({
      kind: 'blood',
      sessionId: session.id,
      name: session.name,
    })
    if (!trackId) return false
    const startedAt = new Date().toISOString()
    await updateBloodSession(session.id, { status: 'active', trackId, startedAt })
    patchSession(session.id, { status: 'active', trackId, startedAt })
    return true
  }

  return {
    sessions: [],
    loaded: false,
    lastAddedId: null,
    showLinks: false,
    manual: null,

    startManual: (kind, note) =>
      set({ manual: { kind, coordinate: null, ...(note?.trim() ? { note } : {}) } }),
    setManualCoordinate: (coordinate) => {
      const { manual } = get()
      if (manual) set({ manual: { ...manual, coordinate } })
    },
    cancelManual: () => set({ manual: null }),
    confirmManual: async () => {
      const { manual } = get()
      if (!manual?.coordinate) {
        return { ok: false, message: 'Touchez la carte pour placer le point.' }
      }
      const result = await get().addMarker(manual.kind, {
        coordinate: manual.coordinate,
        origin: 'manual',
      })
      if (result.ok) {
        set({ manual: null })
        // A note typed in « + Repère » before the position was chosen.
        if (manual.note)
          await get().attachClueMedia(result.waypoint.id, { note: manual.note })
      }
      return result
    },

    cameraOpen: false,
    openCamera: () => set({ cameraOpen: true }),
    closeCamera: () => set({ cameraOpen: false }),

    load: async () => {
      const sessions = await listBloodSessions()
      set({ sessions, loaded: true })
    },

    openSession: () => get().sessions.find(isOpenSession) ?? null,

    startSession: async ({ name, species, hasUsableFix }) => {
      // No second trace is started silently: the caller offers to continue or
      // finish the existing one.
      if (useTracksStore.getState().status !== 'idle') {
        return {
          ok: false,
          reason: 'track-active',
          message: 'Une trace est déjà en cours d’enregistrement.',
        }
      }
      if (get().openSession()) {
        return {
          ok: false,
          reason: 'session-open',
          message: 'Une recherche de sang est déjà ouverte.',
        }
      }
      try {
        const count = get().sessions.length + 1
        const created = await createBloodSession({
          name: name?.trim() || `Recherche ${count}`,
          species: species?.trim() || undefined,
          territoryId: getActiveTerritoryId(),
        })
        set((state) => ({ sessions: [...state.sessions, created] }))
        if (hasUsableFix) {
          const started = await beginRecording(created)
          if (!started) {
            return {
              ok: true,
              session: get().sessions.find((s) => s.id === created.id) ?? created,
            }
          }
        }
        return {
          ok: true,
          session: get().sessions.find((s) => s.id === created.id) ?? created,
        }
      } catch (error) {
        return {
          ok: false,
          reason: 'error',
          message: `Impossible de démarrer la recherche : ${describeError(error)}.`,
        }
      }
    },

    onUsableFix: async () => {
      const waiting = get().sessions.find((s) => s.status === 'waiting_gps')
      if (!waiting) return
      await beginRecording(waiting)
    },

    cancelWaiting: async (id) => {
      const session = get().sessions.find((s) => s.id === id)
      if (!session || session.status !== 'waiting_gps') return
      await deleteBloodSession(id, { deleteContent: false })
      set((state) => ({ sessions: state.sessions.filter((s) => s.id !== id) }))
    },

    pause: async () => {
      const session = get().openSession()
      if (!session || session.status !== 'active') return
      useTracksStore.getState().pause()
      await updateBloodSession(session.id, { status: 'paused' })
      patchSession(session.id, { status: 'paused' })
    },

    resume: async () => {
      const session = get().openSession()
      if (!session || session.status !== 'paused') return
      useTracksStore.getState().resume()
      await updateBloodSession(session.id, { status: 'active' })
      patchSession(session.id, { status: 'active' })
    },

    finish: async (id) => {
      const session = id ? get().sessions.find((s) => s.id === id) : get().openSession()
      if (!session || session.status === 'finished') return
      const tracks = useTracksStore.getState()
      if (tracks.recordingId && tracks.recordingId === session.trackId) {
        await tracks.stop()
      } else if (session.trackId) {
        await tracks.finishInterrupted(session.trackId)
      }
      const endedAt = new Date().toISOString()
      await updateBloodSession(session.id, { status: 'finished', endedAt })
      patchSession(session.id, { status: 'finished', endedAt })
    },

    resumeInterrupted: async (id) => {
      const session = get().sessions.find((s) => s.id === id)
      if (!session?.trackId || session.status === 'finished') return
      useTracksStore.getState().resumeInterrupted(session.trackId)
      await updateBloodSession(id, { status: 'active' })
      patchSession(id, { status: 'active' })
    },

    addMarker: async (kind, position) => {
      const session = get().openSession()
      if (!session) return { ok: false, message: 'Aucune recherche de sang ouverte.' }
      try {
        const waypoint = await addBloodMarker({
          sessionId: session.id,
          kind,
          coordinate: position.coordinate,
          origin: position.origin,
        })
        useWaypointsStore.setState((state) => ({
          waypoints: [...state.waypoints, waypoint],
        }))
        patchSession(session.id, {
          counters: {
            ...session.counters,
            [kind]: (session.counters[kind] ?? 0) + 1,
          },
        })
        set({ lastAddedId: waypoint.id })
        return { ok: true, waypoint }
      } catch (error) {
        // Nothing was written (single transaction): safe to press again.
        return {
          ok: false,
          message: `Indice non enregistré : ${describeError(error)}. Réessayez.`,
        }
      }
    },

    undoInfo: async () => {
      const { lastAddedId } = get()
      if (!lastAddedId) return null
      const waypoint = useWaypointsStore
        .getState()
        .waypoints.find((w) => w.id === lastAddedId)
      if (!waypoint) return null
      const photos = await listPhotosForWaypoint(waypoint.id)
      const hasExtras = Boolean(waypoint.notes?.trim()) || photos.length > 0
      return { waypoint, hasExtras }
    },

    undoLast: async () => {
      const { lastAddedId } = get()
      if (!lastAddedId) return false
      await useWaypointsStore.getState().deleteWaypoint(lastAddedId)
      // The counter is NOT decremented: a number is never reused.
      set({ lastAddedId: null })
      return true
    },

    rename: async (id, name) => {
      const trimmed = name.trim().slice(0, 80)
      if (!trimmed) return false
      await updateBloodSession(id, { name: trimmed })
      patchSession(id, { name: trimmed })
      return true
    },

    setShowLinks: (value) => set({ showLinks: value }),

    attachClueMedia: async (waypointId, media) => {
      try {
        const waypoints = useWaypointsStore.getState()
        const note = media.note?.trim()
        if (note) await waypoints.updateWaypoint(waypointId, { notes: note })
        if (media.photo) {
          const photo = await addPhoto({
            waypointId,
            blob: media.photo.processed,
            originalBlob: media.photo.original,
            coordinate: media.photo.coordinate,
          })
          const current = useWaypointsStore
            .getState()
            .waypoints.find((w) => w.id === waypointId)
          await waypoints.updateWaypoint(waypointId, {
            photoIds: [...(current?.photoIds ?? []), photo.id],
          })
        }
        return true
      } catch {
        return false
      }
    },

    contentCounts: (id) => sessionContentCounts(id),

    deleteSession: async (id, deleteContent) => {
      const session = get().sessions.find((s) => s.id === id)
      if (!session) return
      const tracks = useTracksStore.getState()
      if (session.trackId && tracks.recordingId === session.trackId) await tracks.stop()
      await deleteBloodSession(id, { deleteContent })
      set((state) => ({
        sessions: state.sessions.filter((s) => s.id !== id),
        lastAddedId: null,
      }))
      await Promise.all([tracks.load(), useWaypointsStore.getState().load()])
    },
  }
})
