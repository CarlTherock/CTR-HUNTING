import { create } from 'zustand'
import { getSetting, setSetting } from '@/database/settingsRepository'
import { HUNTING_RULES, type HuntingRuleId } from './huntingRules'

const KEY = 'huntingRule'

interface HuntingRuleState {
  /** The rule the person chose; `null` = none (the sun is shown, no window). */
  ruleId: HuntingRuleId | null
  loaded: boolean
  load: () => Promise<void>
  choose: (ruleId: HuntingRuleId | null) => Promise<void>
}

export const useHuntingRuleStore = create<HuntingRuleState>((set) => ({
  ruleId: null,
  loaded: false,
  load: async () => {
    try {
      const stored = await getSetting<string | null>(KEY, null)
      const ruleId = stored && stored in HUNTING_RULES ? (stored as HuntingRuleId) : null
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
