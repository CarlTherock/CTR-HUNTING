import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/database/db'
import { useFieldModeStore } from './fieldModeStore'

afterEach(async () => {
  useFieldModeStore.setState({ enabled: false, loaded: false })
  await db.settings.clear()
})

describe('fieldModeStore', () => {
  it('defaults to disabled when nothing is persisted yet', async () => {
    await useFieldModeStore.getState().load()

    expect(useFieldModeStore.getState().enabled).toBe(false)
    expect(useFieldModeStore.getState().loaded).toBe(true)
  })

  it('toggle() persists the new value to Dexie', async () => {
    useFieldModeStore.getState().toggle()
    expect(useFieldModeStore.getState().enabled).toBe(true)

    await vi.waitFor(async () => {
      const record = await db.settings.get('fieldModeEnabled')
      expect(record?.value).toBe(true)
    })
  })

  it('load() picks up a previously persisted true value', async () => {
    await db.settings.put({ key: 'fieldModeEnabled', value: true })

    await useFieldModeStore.getState().load()

    expect(useFieldModeStore.getState().enabled).toBe(true)
  })

  it('toggle() flips back off and persists that too', () => {
    useFieldModeStore.getState().toggle() // on
    useFieldModeStore.getState().toggle() // off

    expect(useFieldModeStore.getState().enabled).toBe(false)
  })
})
