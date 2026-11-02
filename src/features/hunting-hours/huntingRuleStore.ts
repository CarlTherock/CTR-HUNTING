import { create } from 'zustand'
import { getSetting, setSetting } from '@/database/settingsRepository'
import { HUNTING_RULES, type HuntingRuleId } from './huntingRules'

const KEY = 'huntingRule'

interface HuntingRuleState {
  /** The person's explicit choice: a rule, `'off'` (removed on purpose) or
   * `null` = never chosen (the card then applies the Québec rule by itself only
   * when the person is located inside Québec). */
  ruleId: HuntingRuleId | 'off' | null
  loaded: boolean
  load: () => Promise<void>
  choose: (ruleId: HuntingRuleId | 'off' | null) => Promise<void>
}

export const useHuntingRuleStore = create<HuntingRuleState>((set) => ({
  ruleId: null,
  loaded: false,
  load: async () => {
    try {
      const stored = await getSetting<string | null>(KEY, null)
      const ruleId =
        stored === 'off'
          ? 'off'
          : stored && stored in HUNTING_RULES
            ? (stored as HuntingRuleId)
            : null
      set({ ruleId, loaded: true })
    } catch {
      set({ ruleId: null, loaded: true })
    }
  },
  choose: async (ruleId) => {
    set({ ruleId })
    try {
      await setSetting<string | null>(KEY, ruleId)
    } catch {
      // The choice still applies for this session.
    }
  },
}))
