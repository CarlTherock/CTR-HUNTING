import { create } from 'zustand'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import type { Waypoint } from '@/types'

/**
 * State of "Aller à": which saved waypoint is the destination, whether the
 * panel is collapsed, and a notice when guidance had to stop by itself.
 *
 * Deliberately NOT persisted (a guidance session never survives a reload) and
 * deliberately READ-ONLY with respect to the data: it holds only the
 * destination's id. The coordinates are read from `waypointsStore` each time
 * they are needed, so they are never copied, edited or written. Starting or
 * stopping guidance does not touch waypoints, tracks or any recording.
 */
interface GuidanceState {
  destinationId: string | null
  collapsed: boolean
  /** Visible message when guidance stopped on its own (or could not start). */
  notice: string | null

  /** Starts guiding to a saved waypoint. Returns `false` (and sets a notice)
   * if it does not exist or has no usable coordinate. */
  start: (waypointId: string) => boolean
  stop: () => void
  setCollapsed: (collapsed: boolean) => void
  dismissNotice: () => void
}

function hasUsableCoordinate(waypoint: Waypoint): boolean {
  const { lat, lng } = waypoint.coordinate
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  )
}

export const useGuidanceStore = create<GuidanceState>((set) => ({
  destinationId: null,
  collapsed: false,
  notice: null,

  start: (waypointId) => {
    const waypoint = useWaypointsStore
      .getState()
      .waypoints.find((w) => w.id === waypointId)
    if (!waypoint || !hasUsableCoordinate(waypoint)) {
      set({
        notice:
          'Ce point de repère est introuvable ou sans position valide : guidage impossible.',
      })
      return false
    }
    set({ destinationId: waypointId, collapsed: false, notice: null })
    return true
  },

  stop: () => set({ destinationId: null, collapsed: false }),

  setCollapsed: (collapsed) => set({ collapsed }),
  dismissNotice: () => set({ notice: null }),
}))

// If the destination is deleted while guiding, stop with a visible notice
// rather than keep pointing at a place that no longer exists.
useWaypointsStore.subscribe((state, previous) => {
  const { destinationId } = useGuidanceStore.getState()
  if (!destinationId || state.waypoints === previous.waypoints) return
  if (state.waypoints.some((w) => w.id === destinationId)) return
  const name = previous.waypoints.find((w) => w.id === destinationId)?.name
  useGuidanceStore.setState({
    destinationId: null,
    collapsed: false,
    notice: `Le point « ${name ?? 'sans nom'} » a été supprimé : le guidage est arrêté.`,
  })
})

/** The waypoint being guided to, read live from the waypoints store. */
export function useGuidanceDestination(): Waypoint | null {
  const id = useGuidanceStore((state) => state.destinationId)
  return useWaypointsStore((state) =>
    id ? (state.waypoints.find((w) => w.id === id) ?? null) : null,
  )
}
