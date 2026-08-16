import { afterEach, describe, expect, it } from 'vitest'
import { db } from '@/database/db'
import { useTracksStore } from './tracksStore'

const RESET_STATE = {
  tracks: [],
  loaded: false,
  status: 'idle' as const,
  recordingId: null,
  recordingStartedAt: null,
  points: [],
  distanceMeters: 0,
}

afterEach(async () => {
  await db.tracks.clear()
  useTracksStore.setState(RESET_STATE)
})

describe('tracksStore', () => {
  it('loads tracks from Dexie', async () => {
    await db.tracks.add({
      id: 't1',
      name: 'Existing',
      points: [],
      startedAt: '2026-08-16T10:00:00.000Z',
    })

    await useTracksStore.getState().load()

    expect(useTracksStore.getState().loaded).toBe(true)
    expect(useTracksStore.getState().tracks).toHaveLength(1)
  })

  it('starts a recording: persists a track immediately and flips status', async () => {
    await useTracksStore.getState().start()

    const state = useTracksStore.getState()
    expect(state.status).toBe('recording')
    expect(state.recordingId).toBeTruthy()
    expect(state.tracks).toHaveLength(1)

    const [persisted] = await db.tracks.toArray()
    expect(persisted.id).toBe(state.recordingId)
    expect(persisted.points).toEqual([])
  })

  it('addPoint is a no-op while idle', () => {
    useTracksStore.getState().addPoint({ lat: 46.8, lng: -71.2 })
    expect(useTracksStore.getState().points).toEqual([])
  })

  it('addPoint records a sample while recording and persists it', async () => {
    await useTracksStore.getState().start()

    useTracksStore.getState().addPoint({ lat: 46.8, lng: -71.2 })

    const state = useTracksStore.getState()
    expect(state.points).toHaveLength(1)

    const [persisted] = await db.tracks.toArray()
    expect(persisted.points).toHaveLength(1)
  })

  it('drops a sample too close to the last one (GPS jitter, not real movement)', async () => {
    await useTracksStore.getState().start()

    useTracksStore.getState().addPoint({ lat: 46.8, lng: -71.2 })
    useTracksStore.getState().addPoint({ lat: 46.800001, lng: -71.2 }) // ~0.1m away

    expect(useTracksStore.getState().points).toHaveLength(1)
  })

  it('addPoint is a no-op while paused', async () => {
    await useTracksStore.getState().start()
    useTracksStore.getState().pause()

    useTracksStore.getState().addPoint({ lat: 46.8, lng: -71.2 })

    expect(useTracksStore.getState().points).toEqual([])
  })

  it('resume allows recording to continue after a pause', async () => {
    await useTracksStore.getState().start()
    useTracksStore.getState().pause()
    useTracksStore.getState().resume()

    useTracksStore.getState().addPoint({ lat: 46.8, lng: -71.2 })

    expect(useTracksStore.getState().status).toBe('recording')
    expect(useTracksStore.getState().points).toHaveLength(1)
  })

  it('stop finalizes the track with distance and an end timestamp', async () => {
    await useTracksStore.getState().start()
    useTracksStore.getState().addPoint({ lat: 46.8, lng: -71.2 })
    useTracksStore.getState().addPoint({ lat: 46.801, lng: -71.2 })

    const recordingId = useTracksStore.getState().recordingId
    expect(recordingId).toBeTruthy()
    await useTracksStore.getState().stop()

    const state = useTracksStore.getState()
    expect(state.status).toBe('idle')
    expect(state.recordingId).toBeNull()
    expect(state.points).toEqual([])

    const persisted = await db.tracks.get(recordingId as string)
    expect(persisted?.endedAt).toBeTruthy()
    expect(persisted?.distanceMeters).toBeGreaterThan(0)
    expect(persisted?.points).toHaveLength(2)
  })

  it('deleteTrack removes it from Dexie and state, and stops recording if it was the active one', async () => {
    await useTracksStore.getState().start()
    const id = useTracksStore.getState().recordingId
    expect(id).toBeTruthy()

    await useTracksStore.getState().deleteTrack(id as string)

    expect(useTracksStore.getState().tracks).toEqual([])
    expect(useTracksStore.getState().status).toBe('idle')
    expect(useTracksStore.getState().recordingId).toBeNull()
    expect(await db.tracks.get(id as string)).toBeUndefined()
  })
})
