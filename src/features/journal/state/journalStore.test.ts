import { afterEach, describe, expect, it } from 'vitest'
import { db } from '@/database/db'
import { useJournalStore } from './journalStore'

const COORDINATE = { lat: 46.8, lng: -71.2 }

afterEach(async () => {
  await db.observations.clear()
  useJournalStore.setState({ observations: [], loaded: false, editingId: null })
})

describe('journalStore', () => {
  it('loads real observations from Dexie', async () => {
    await db.observations.add({
      id: 'o1',
      coordinate: COORDINATE,
      timestamp: '2026-08-17T10:00:00.000Z',
      notes: 'Deer sign',
    })

    await useJournalStore.getState().load()

    expect(useJournalStore.getState().observations).toHaveLength(1)
    expect(useJournalStore.getState().loaded).toBe(true)
  })

  it('create() persists a real observation and opens it for editing', async () => {
    const observation = await useJournalStore.getState().create({ coordinate: COORDINATE, notes: 'New entry' })

    expect(useJournalStore.getState().observations).toContainEqual(
      expect.objectContaining({ id: observation.id, notes: 'New entry' }),
    )
    expect(useJournalStore.getState().editingId).toBe(observation.id)
    expect(await db.observations.get(observation.id)).toBeDefined()
  })

  it('update() patches both the store and Dexie', async () => {
    const observation = await useJournalStore.getState().create({ coordinate: COORDINATE, notes: 'Draft' })

    await useJournalStore.getState().update(observation.id, { notes: 'Final' })

    expect(useJournalStore.getState().observations.find((o) => o.id === observation.id)?.notes).toBe(
      'Final',
    )
    expect((await db.observations.get(observation.id))?.notes).toBe('Final')
  })

  it('remove() deletes a real observation from both the store and Dexie', async () => {
    const observation = await useJournalStore.getState().create({ coordinate: COORDINATE, notes: '' })

    await useJournalStore.getState().remove(observation.id)

    expect(useJournalStore.getState().observations).toEqual([])
    expect(await db.observations.get(observation.id)).toBeUndefined()
  })

  it('select() sets/clears which entry is open', () => {
    useJournalStore.getState().select('o1')
    expect(useJournalStore.getState().editingId).toBe('o1')

    useJournalStore.getState().select(null)
    expect(useJournalStore.getState().editingId).toBeNull()
  })
})
