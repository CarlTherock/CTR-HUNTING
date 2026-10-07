import { create } from 'zustand'
import { getSetting, setSetting } from '@/database/settingsRepository'

/** ISO date the presentation was finished or skipped; absent = never seen. */
export const ONBOARDING_SETTING_KEY = 'onboardingCompletedAt'

interface OnboardingState {
  /** The saved state was read (or reading failed and we gave up). */
  loaded: boolean
  /** The presentation was already finished or skipped. */
  completed: boolean
  /** The presentation is wanted on screen. */
  open: boolean
  /** Why it is open: a first launch only shows on the home page (so a deep
   * link or a shared-point link is never covered by it); a manual replay
   * shows wherever the user asked for it. */
  origin: 'auto' | 'manual' | null

  /** Reads the saved state; opens the presentation on a first launch only.
   * If the database cannot be read the user is NOT blocked: nothing opens. */
  load: () => Promise<void>
  /** Finish or skip: both are remembered, the presentation never reappears
   * by itself. A failed write is swallowed (it will simply show again). */
  finish: () => void
  /** Manual replay (Réglages, Aide). Does not change what is remembered. */
  replay: () => void
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  loaded: false,
  completed: false,
  open: false,
  origin: null,

  load: async () => {
    if (get().loaded) return
    try {
      const completedAt = await getSetting<string | null>(ONBOARDING_SETTING_KEY, null)
      const completed = typeof completedAt === 'string' && completedAt.length > 0
      set({
        loaded: true,
        completed,
        open: !completed,
        origin: completed ? null : 'auto',
      })
    } catch {
      set({ loaded: true, completed: true, open: false, origin: null })
    }
  },

  finish: () => {
    set({ open: false, completed: true, origin: null })
    void setSetting(ONBOARDING_SETTING_KEY, new Date().toISOString()).catch(
      () => undefined,
    )
  },

  replay: () => set({ open: true, origin: 'manual' }),
}))
