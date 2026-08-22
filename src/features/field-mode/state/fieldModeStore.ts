import { create } from 'zustand'
import { getSetting, setSetting } from '@/database/settingsRepository'

const SETTING_KEY = 'fieldModeEnabled'

/**
 * Phase 11 — Field Mode: a persisted toggle for the simplified,
 * high-touch-target, low-power map UI. Persisted via the same
 * `settingsRepository` pattern as other app-level preferences, so it
 * survives reloads without needing its own Dexie table.
 */
interface FieldModeState {
  enabled: boolean
  loaded: boolean
  load: () => Promise<void>
  toggle: () => void
}

export const useFieldModeStore = create<FieldModeState>((set, get) => ({
  enabled: false,
  loaded: false,

  load: async () => {
    const enabled = await getSetting<boolean>(SETTING_KEY, false)
    set({ enabled, loaded: true })
  },

  toggle: () => {
    const next = !get().enabled
    set({ enabled: next })
    void setSetting(SETTING_KEY, next)
  },
}))
