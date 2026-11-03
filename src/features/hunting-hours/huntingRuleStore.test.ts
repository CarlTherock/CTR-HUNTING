import { afterEach, describe, expect, it, vi } from 'vitest'

const getSetting = vi.fn()
const setSetting = vi.fn()
vi.mock('@/database/settingsRepository', () => ({
  getSetting: (...a: unknown[]) => getSetting(...a),
  setSetting: (...a: unknown[]) => setSetting(...a),
}))

import { useHuntingRuleStore } from './huntingRuleStore'

afterEach(() => {
  vi.clearAllMocks()
  useHuntingRuleStore.setState({ ruleId: null, loaded: false })
})

describe('huntingRuleStore', () => {
  it('a choice made while load() is still reading is not overwritten', async () => {
    let release: (v: string | null) => void = () => undefined
    getSetting.mockReturnValue(new Promise((r) => (release = r)))
    setSetting.mockResolvedValue(undefined)
    const loading = useHuntingRuleStore.getState().load()
    await useHuntingRuleStore.getState().choose('off')
    release(null)
    await loading
    expect(useHuntingRuleStore.getState().ruleId).toBe('off')
    expect(useHuntingRuleStore.getState().loaded).toBe(true)
  })

  it('load() restores a stored removal', async () => {
    getSetting.mockResolvedValue('off')
    await useHuntingRuleStore.getState().load()
    expect(useHuntingRuleStore.getState().ruleId).toBe('off')
  })
})
