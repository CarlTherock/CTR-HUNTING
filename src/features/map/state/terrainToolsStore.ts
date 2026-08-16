import { create } from 'zustand'
import type { Coordinate } from '@/types'
import type { SlopeAspect } from '@/utils/terrain'
import type { ElevationProfilePoint } from '../terrainQuery'

export type TerrainToolMode = 'idle' | 'querying' | 'profiling'

export interface TerrainQueryResult {
  coordinate: Coordinate
  elevationMeters: number | null
  slopeAspect: SlopeAspect | null
}

interface TerrainToolsState {
  mode: TerrainToolMode
  queryResult: TerrainQueryResult | null
  profilePoints: Coordinate[]
  profileData: ElevationProfilePoint[] | null

  /** Arms single-tap "what's the altitude/slope/aspect here" mode. */
  startQuerying: () => void
  /** Arms multi-tap "draw a line, then show its elevation profile" mode. */
  startProfiling: () => void
  cancel: () => void
  /** Records a query result and immediately exits querying mode — one
   * tap, one answer, same UX as placing a waypoint. */
  setQueryResult: (result: TerrainQueryResult) => void
  closeQuery: () => void
  addProfilePoint: (coordinate: Coordinate) => void
  removeLastProfilePoint: () => void
  /** `data` is computed by the caller (it needs live map access to sample
   * elevations) — the store just holds the result and exits profiling
   * mode, keeping the chart panel open until `closeProfile`. */
  finishProfile: (data: ElevationProfilePoint[]) => void
  closeProfile: () => void
}

export const useTerrainToolsStore = create<TerrainToolsState>((set) => ({
  mode: 'idle',
  queryResult: null,
  profilePoints: [],
  profileData: null,

  startQuerying: () => set({ mode: 'querying', queryResult: null }),
  startProfiling: () => set({ mode: 'profiling', profilePoints: [], profileData: null }),
  cancel: () => set({ mode: 'idle', queryResult: null, profilePoints: [], profileData: null }),
  setQueryResult: (result) => set({ mode: 'idle', queryResult: result }),
  closeQuery: () => set({ queryResult: null }),
  addProfilePoint: (coordinate) =>
    set((state) => ({ profilePoints: [...state.profilePoints, coordinate] })),
  removeLastProfilePoint: () =>
    set((state) => ({ profilePoints: state.profilePoints.slice(0, -1) })),
  finishProfile: (data) => set({ mode: 'idle', profileData: data }),
  closeProfile: () => set({ profilePoints: [], profileData: null }),
}))
