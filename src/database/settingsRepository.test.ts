import { afterEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { getSetting, setSetting } from './settingsRepository'

describe('local persistence (IndexedDB via Dexie)', () => {
  afterEach(async () => {
    await db.settings.clear()
  })

  it('returns the fallback when a setting has never been written', async () => {
    const value = await getSetting('theme', 'dark')
    expect(value).toBe('dark')
  })

  it('persists and reads back a value across calls, offline-capable by construction', async () => {
    await setSetting('theme', 'high-contrast')
    const value = await getSetting('theme', 'dark')
    expect(value).toBe('high-contrast')
  })

  it('keeps distinct keys independent', async () => {
    await setSetting('a', 1)
    await setSetting('b', 2)
    expect(await getSetting('a', 0)).toBe(1)
    expect(await getSetting('b', 0)).toBe(2)
  })
})
