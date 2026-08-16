import { create } from 'zustand'
import {
  createWaypoint,
  deleteWaypoint as deleteWaypointRecord,
  listWaypoints,
  updateWaypoint as updateWaypointRecord,
} from '@/database/waypointsRepository'
import type { Coordinate, Waypoint, WaypointCategory } from '@/types'

interface WaypointsState {
  waypoints: Waypoint[]
  loaded: boolean
  /** Waiting for a map tap to place a new waypoint there. */
  isPlacing: boolean
  /** Waypoint currently shown in the edit panel, if any. */
  editingId: string | null

  load: () => Promise<void>
  startPlacing: () => void
  cancelPlacing: () => void
  /** Creates a real (persisted) waypoint at `coordinate` and opens it for
   * editing — there is no separate "unsaved draft" concept; every
   * waypoint on the map is always a real Dexie record, matching the
   * project's offline-first "always persisted" approach. */
  placeWaypointAt: (coordinate: Coordinate) => Promise<void>
  selectWaypoint: (id: string) => void
  closeEdit: () => void
  updateWaypoint: (
    id: string,
    patch: Partial<{ name: string; category: WaypointCategory; notes: string }>,
  ) => Promise<void>
  deleteWaypoint: (id: string) => Promise<void>
}

let nextDefaultNumber = 1

export const useWaypointsStore = create<WaypointsState>((set) => ({
  waypoints: [],
  loaded: false,
  isPlacing: false,
  editingId: null,

  load: async () => {
    const waypoints = await listWaypoints()
    nextDefaultNumber = waypoints.length + 1
    set({ waypoints, loaded: true })
  },

  startPlacing: () => set({ isPlacing: true }),
  cancelPlacing: () => set({ isPlacing: false }),

  placeWaypointAt: async (coordinate) => {
    const waypoint = await createWaypoint({
      name: `Waypoint ${nextDefaultNumber++}`,
      coordinate,
      category: 'general',
    })
    set((state) => ({
      waypoints: [...state.waypoints, waypoint],
      isPlacing: false,
      editingId: waypoint.id,
    }))
  },

  selectWaypoint: (id) => set({ editingId: id }),
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
    set((state) => ({
      waypoints: state.waypoints.filter((w) => w.id !== id),
      editingId: state.editingId === id ? null : state.editingId,
    }))
  },
}))
