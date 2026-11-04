import { create } from 'zustand'
import { getSetting, setSetting } from '@/database/settingsRepository'
import {
  DEFAULT_RADAR_SMOOTHING,
  parseRadarSmoothing,
  type RadarSmoothing,
} from '@/services/weather-map/softTemplate'

const KEY = 'weatherSmoothing'

interface RadarSmoothingState {
  /** Rendu of the radar / precipitation tiles. « Doux » by default. */
  level: RadarSmoothing
  loaded: boolean
  load: () => Promise<void>
  setLevel: (level: RadarSmoothing) => Promise<void>
}

/** A slow `load()` never overwrites a choice made while it was reading. */
let version = 0

export const useRadarSmoothingStore = create<RadarSmoothingState>((set) => ({
  level: DEFAULT_RADAR_SMOOTHING,
  loaded: false,
  load: async () => {
    const start = version
    try {
      const stored = await getSetting<unknown>(KEY, null)
      if (start === version) set({ level: parseRadarSmoothing(stored), loaded: true })
      else set({ loaded: true })
    } catch {
      set({ loaded: true })
    }
  },
  setLevel: async (level) => {
    version += 1
    set({ level })
    try {
      await setSetting<RadarSmoothing>(KEY, level)
    } catch {
      // Still applied for this session.
    }
  },
}))
