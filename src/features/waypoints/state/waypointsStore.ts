import { create } from 'zustand'
import { deletePhotosForWaypoint } from '@/database/photosRepository'
import {
  createWaypoint,
  deleteWaypoint as deleteWaypointRecord,
  listWaypoints,
  updateWaypoint as updateWaypointRecord,
} from '@/database/waypointsRepository'
import type { UpdateWaypointInput } from '@/database/waypointsRepository'
import { onTerritoryDeleted } from '@/features/territories/state/territoriesStore'
import type { Coordinate, Waypoint, WaypointCategory, WaypointColor } from '@/types'

/** Metadata a user can set on a waypoint — never its position. */
export interface WaypointFields {
  name: string
  category: WaypointCategory
  color: WaypointColor
  notes: string
  optimalWindDirections: number[]
  /** Folder to file the waypoint in; `undefined` = « Non classé ». */
  territoryId?: string
}

/** A waypoint being created: it exists only in memory until the user saves.
 * Its position can still be adjusted; cancelling leaves nothing behind. */
export interface WaypointDraft {
  coordinate: Coordinate
  saving: boolean
  /** Why the last save failed; the draft stays open so nothing is lost. */
  error: string | null
  /** Name to pre-fill the form with (e.g. from a shared link). The user can
   * still change it; nothing is saved until they press Save. */
  initialName?: string
}

interface WaypointsState {
  waypoints: Waypoint[]
  loaded: boolean
  /** Waiting for a map tap to place a new waypoint there. */
  isPlacing: boolean
  /** Waypoint being created (not yet saved), if any. */
  draft: WaypointDraft | null
  /** Saved waypoint currently shown in the edit panel, if any. */
  editingId: string | null

  load: () => Promise<void>
  startPlacing: () => void
  cancelPlacing: () => void
  /** Starts a draft at `coordinate`. Nothing is written to the database yet. */
  placeWaypointAt: (coordinate: Coordinate) => void
  /** Starts a draft right away (no "placing" step) — used when saving a point
   * received through a shared link. Always a NEW waypoint; existing ones are
   * never touched. Nothing is written until `saveDraft`. */
  startDraftAt: (coordinate: Coordinate, initialName?: string) => void
  /** Adjusts the draft's position (map tap or marker drag) — drafts only. */
  moveDraft: (coordinate: Coordinate) => void
  /** Discards the draft; no waypoint is created. */
  cancelDraft: () => void
  /** Persists the draft with its metadata and locks its position. Returns
   * `false` — keeping the draft open, with `draft.error` set — if the write
   * fails. */
  saveDraft: (fields: WaypointFields) => Promise<boolean>
  selectWaypoint: (id: string) => void
  closeEdit: () => void
  /** Edits metadata of a saved waypoint. Rejects with
   * `WaypointLockedError` if the patch contains a `coordinate`. */
  updateWaypoint: (id: string, patch: UpdateWaypointInput) => Promise<void>
  deleteWaypoint: (id: string) => Promise<void>
}

let nextDefaultNumber = 1

function describeError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'erreur inconnue'
}

export const useWaypointsStore = create<WaypointsState>((set, get) => ({
  waypoints: [],
  loaded: false,
  isPlacing: false,
  draft: null,
  editingId: null,

  load: async () => {
    const waypoints = await listWaypoints()
    nextDefaultNumber = waypoints.length + 1
    set({ waypoints, loaded: true })
  },

  startPlacing: () => set({ isPlacing: true }),
  cancelPlacing: () => set({ isPlacing: false }),

  placeWaypointAt: (coordinate) => {
    // `isPlacing` is cleared synchronously so a second click from the same
    // physical tap (mouse + touch events) cannot start a second draft.
    if (!get().isPlacing) return
    set({
      isPlacing: false,
      editingId: null,
      draft: { coordinate, saving: false, error: null },
    })
  },

  startDraftAt: (coordinate, initialName) =>
    set({
      isPlacing: false,
      editingId: null,
      draft: { coordinate, saving: false, error: null, initialName },
    }),

  moveDraft: (coordinate) => {
    const { draft } = get()
    if (!draft || draft.saving) return
    set({ draft: { ...draft, coordinate, error: null } })
  },

  cancelDraft: () => set({ draft: null }),

  saveDraft: async (fields) => {
    const { draft } = get()
    if (!draft || draft.saving) return false
    set({ draft: { ...draft, saving: true, error: null } })
    try {
      // One write: the waypoint never exists half-saved, so a retry after a
      // failure cannot leave a duplicate behind.
      const created = await createWaypoint({
        name: fields.name.trim() || `Point de repère ${nextDefaultNumber}`,
        coordinate: draft.coordinate,
        category: fields.category,
        color: fields.color,
        notes: fields.notes,
        optimalWindDirections: fields.optimalWindDirections,
        territoryId: fields.territoryId,
      })
      nextDefaultNumber++
      set((state) => ({
        waypoints: [...state.waypoints, created],
        draft: null,
        editingId: null,
      }))
      return true
    } catch (error) {
      set({
        draft: {
          ...draft,
          saving: false,
          error: `Enregistrement impossible : ${describeError(error)}.`,
        },
      })
      return false
    }
  },

  selectWaypoint: (id) => set({ editingId: id, draft: null }),
  closeEdit: () => set({ editingId: null }),

  updateWaypoint: async (id, patch) => {
    await updateWaypointRecord(id, patch)
    set((state) => ({
      waypoints: state.waypoints.map((w) =>
        w.id === id ? { ...w, ...patch, updatedAt: new Date().toISOString() } : w,
      ),
    }))
  },

  deleteWaypoint: async (id) => {
    await deleteWaypointRecord(id)
    // Photos reference their waypoint but nothing references the photos
    // back — without this they'd be orphaned in Dexie forever.
    await deletePhotosForWaypoint(id)
    set((state) => ({
      waypoints: state.waypoints.filter((w) => w.id !== id),
      editingId: state.editingId === id ? null : state.editingId,
    }))
  },
}))

// A deleted territory's waypoints were moved to « Non classé » in the
// database; mirror that in memory (coordinates and everything else are
// untouched).
onTerritoryDeleted((territoryId) => {
  useWaypointsStore.setState((state) => ({
    waypoints: state.waypoints.map((w) => {
      if (w.territoryId !== territoryId) return w
      const released = { ...w }
      delete released.territoryId
      return released
    }),
  }))
})
