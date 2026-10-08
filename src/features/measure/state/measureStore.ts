import { create } from 'zustand'
import type { Coordinate } from '@/types'

export type MeasureKind = 'distance' | 'area'

/** Fewest points for which a result exists: a segment, a polygon. */
export const MIN_POINTS: Record<MeasureKind, number> = { distance: 2, area: 3 }

interface MeasureState {
  /** `null` = no measurement at all (tool never opened, or closed). */
  kind: MeasureKind | null
  /** Taps on the map add points. Off while paused or finished. */
  active: boolean
  /** "Terminer" was pressed: the measurement is locked and summarised. */
  finished: boolean
  points: Coordinate[]
  /** Results body folded to its title bar (small / landscape screens). */
  collapsed: boolean

  /** Opens `kind`. Re-opening the same unfinished measurement resumes it
   * (points kept); anything else starts from scratch. */
  start: (kind: MeasureKind) => void
  /** Stops collecting taps (another map tool took over) but keeps what is drawn. */
  pause: () => void
  addPoint: (coordinate: Coordinate) => void
  removeLastPoint: () => void
  /** Locks the measurement. Ignored below `MIN_POINTS[kind]`. */
  finish: () => void
  /** Empties the measurement and arms it again. */
  clear: () => void
  /** Leaves the tool entirely: no points, no panel, no mode. */
  close: () => void
  setCollapsed: (collapsed: boolean) => void
}

const EMPTY = { kind: null, active: false, finished: false, points: [] as Coordinate[] }

/** Ephemeral by design: nothing here is written to IndexedDB. */
export const useMeasureStore = create<MeasureState>((set, get) => ({
  ...EMPTY,
  collapsed: false,

  start: (kind) => {
    const state = get()
    if (state.kind === kind && !state.finished) {
      set({ active: true })
      return
    }
    set({ kind, active: true, finished: false, points: [], collapsed: false })
  },
  pause: () => set((state) => (state.active ? { active: false } : state)),
  addPoint: (coordinate) =>
    set((state) =>
      state.active && !state.finished ? { points: [...state.points, coordinate] } : state,
    ),
  removeLastPoint: () =>
    set((state) =>
      state.finished || state.points.length === 0
        ? state
        : { points: state.points.slice(0, -1) },
    ),
  finish: () =>
    set((state) =>
      state.kind && !state.finished && state.points.length >= MIN_POINTS[state.kind]
        ? { finished: true, active: false }
        : state,
    ),
  clear: () =>
    set((state) => (state.kind ? { points: [], finished: false, active: true } : state)),
  close: () => set({ ...EMPTY }),
  setCollapsed: (collapsed) => set({ collapsed }),
}))
