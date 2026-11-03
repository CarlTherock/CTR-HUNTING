import { create } from 'zustand'
import { getSetting, setSetting } from '@/database/settingsRepository'
import { DEFAULT_WIND_STYLE, parseWindStyle, type WindStyle } from '@/utils/windStyle'

const KEY = 'windStyle'

interface WindStyleState {
  style: WindStyle
  loaded: boolean
  load: () => Promise<void>
  /** Applies at once (no network) and saves on the device. */
  update: (patch: Partial<WindStyle>) => Promise<void>
}

/** Counts changes so a slow `load()` never overwrites a choice made while it
 * was still reading the database. */
let version = 0

export const useWindStyleStore = create<WindStyleState>((set, get) => ({
  style: DEFAULT_WIND_STYLE,
  loaded: false,
  load: async () => {
    const start = version
    try {
      const stored = await getSetting<unknown>(KEY, null)
      if (start === version) set({ style: parseWindStyle(stored), loaded: true })
      else set({ loaded: true })
    } catch {
      set({ loaded: true })
    }
  },
  update: async (patch) => {
    version += 1
    const style = { ...get().style, ...patch }
    set({ style })
    try {
      await setSetting<WindStyle>(KEY, style)
    } catch {
      // Still applied for this session.
    }
  },
}))
