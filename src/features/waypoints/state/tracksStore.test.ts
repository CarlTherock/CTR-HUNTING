import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/database/db'
import { isInterruptedTrack, useTracksStore } from './tracksStore'

const RESET_STATE = {
  tracks: [],
  loaded: false,
  status: 'idle' as const,
  recordingId: null,
  recordingStartedAt: null,
  points: [],
  distanceMeters: 0,
  persistError: null,
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

  describe('durability', () => {
    it('writes every accepted point to the device as it arrives', async () => {
      await useTracksStore.getState().start()
      const id = useTracksStore.getState().recordingId as string

      useTracksStore.getState().addPoint({ lat: 46.8, lng: -71.2 })
      useTracksStore.getState().addPoint({ lat: 46.801, lng: -71.2 })
      await useTracksStore.getState().flush()

      expect((await db.tracks.get(id))?.points).toHaveLength(2)
    })

    it('shows a visible error and keeps the points in memory when a write fails', async () => {
      await useTracksStore.getState().start()
      const spy = vi
        .spyOn(db.tracks, 'update')
        .mockRejectedValueOnce(new Error('disk full'))

      useTracksStore.getState().addPoint({ lat: 46.8, lng: -71.2 })
      await useTracksStore.getState().flush()

      expect(useTracksStore.getState().persistError).toContain('disk full')
      expect(useTracksStore.getState().points).toHaveLength(1)
      spy.mockRestore()
    })

    it('clears the error and saves everything once the device accepts writes again', async () => {
      await useTracksStore.getState().start()
      const id = useTracksStore.getState().recordingId as string
      const spy = vi
        .spyOn(db.tracks, 'update')
        .mockRejectedValueOnce(new Error('blocked'))
      useTracksStore.getState().addPoint({ lat: 46.8, lng: -71.2 })
      await useTracksStore.getState().flush()
      spy.mockRestore()
      expect(useTracksStore.getState().persistError).not.toBeNull()

      useTracksStore.getState().addPoint({ lat: 46.801, lng: -71.2 })
      await useTracksStore.getState().flush()

      expect(useTracksStore.getState().persistError).toBeNull()
      expect((await db.tracks.get(id))?.points).toHaveLength(2)
    })

    it('does not start recording when the track cannot be created', async () => {
      const spy = vi.spyOn(db.tracks, 'add').mockRejectedValueOnce(new Error('no space'))

      await useTracksStore.getState().start()

      expect(useTracksStore.getState().status).toBe('idle')
      expect(useTracksStore.getState().persistError).toContain('no space')
      spy.mockRestore()
    })

    it('stays in recording state when the final write fails, so nothing is lost', async () => {
      await useTracksStore.getState().start()
      useTracksStore.getState().addPoint({ lat: 46.8, lng: -71.2 })
      await useTracksStore.getState().flush()
      const spy = vi.spyOn(db.tracks, 'update').mockRejectedValueOnce(new Error('locked'))

      await useTracksStore.getState().stop()

      expect(useTracksStore.getState().status).toBe('recording')
      expect(useTracksStore.getState().points).toHaveLength(1)
      expect(useTracksStore.getState().persistError).toContain('locked')
      spy.mockRestore()
    })
  })

  describe('interrupted tracks (app closed or phone locked mid-recording)', () => {
    const points = [
      { lat: 46.8, lng: -71.2, timestamp: '2026-08-16T10:00:05.000Z' },
      { lat: 46.801, lng: -71.2, timestamp: '2026-08-16T10:00:35.000Z' },
    ]

    async function seedInterrupted() {
      await db.tracks.add({
        id: 'cut',
        name: 'Trace coupée',
        points,
        startedAt: '2026-08-16T10:00:00.000Z',
        distanceMeters: 111,
      })
      await useTracksStore.getState().load()
    }

    it('flags a loaded track without an end time as interrupted, data untouched', async () => {
      await seedInterrupted()

      const [track] = useTracksStore.getState().tracks
      expect(isInterruptedTrack(track, useTracksStore.getState().recordingId)).toBe(true)
      expect(track.points).toEqual(points)
      expect(track.endedAt).toBeUndefined()
    })

    it('does not flag a finished track, nor the one being recorded now', async () => {
      await db.tracks.add({
        id: 'done',
        name: 'Finie',
        points,
        startedAt: points[0].timestamp,
        endedAt: points[1].timestamp,
      })
      await useTracksStore.getState().load()
      await useTracksStore.getState().start()

      for (const track of useTracksStore.getState().tracks) {
        expect(isInterruptedTrack(track, useTracksStore.getState().recordingId)).toBe(
          false,
        )
      }
    })

    it('finishInterrupted ends the track at its last real point, never later', async () => {
      await seedInterrupted()

      await useTracksStore.getState().finishInterrupted('cut')

      expect((await db.tracks.get('cut'))?.endedAt).toBe(points[1].timestamp)
      expect(useTracksStore.getState().tracks[0].endedAt).toBe(points[1].timestamp)
    })

    it('resumeInterrupted continues into the same track, keeping the earlier points', async () => {
      await seedInterrupted()

      useTracksStore.getState().resumeInterrupted('cut')
      expect(useTracksStore.getState().status).toBe('recording')
      expect(useTracksStore.getState().recordingId).toBe('cut')

      useTracksStore.getState().addPoint({ lat: 46.81, lng: -71.2 })
      await useTracksStore.getState().flush()

      expect((await db.tracks.get('cut'))?.points).toHaveLength(3)
      expect(useTracksStore.getState().tracks).toHaveLength(1)
    })

    it('refuses to resume while another recording is active', async () => {
      await seedInterrupted()
      await useTracksStore.getState().start()
      const activeId = useTracksStore.getState().recordingId

      useTracksStore.getState().resumeInterrupted('cut')

      expect(useTracksStore.getState().recordingId).toBe(activeId)
    })
  })

  describe('renameTrack', () => {
    it('renames and persists, trimming whitespace', async () => {
      await db.tracks.add({
        id: 'r',
        name: 'Avant',
        points: [],
        startedAt: '2026-08-16T10:00:00.000Z',
      })
      await useTracksStore.getState().load()

      expect(await useTracksStore.getState().renameTrack('r', '  Crête nord  ')).toBe(
        true,
      )

      expect((await db.tracks.get('r'))?.name).toBe('Crête nord')
      expect(useTracksStore.getState().tracks[0].name).toBe('Crête nord')
    })

    it('rejects an empty name and leaves the track unchanged', async () => {
      await db.tracks.add({
        id: 'r',
        name: 'Avant',
        points: [],
        startedAt: '2026-08-16T10:00:00.000Z',
      })
      await useTracksStore.getState().load()

      expect(await useTracksStore.getState().renameTrack('r', '   ')).toBe(false)

      expect((await db.tracks.get('r'))?.name).toBe('Avant')
    })
  })
})
