import { afterEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { createTrack, deleteTrack, listTracks, updateTrack } from './tracksRepository'

describe('tracksRepository (IndexedDB via Dexie)', () => {
  afterEach(async () => {
    await db.tracks.clear()
  })

  it('starts empty', async () => {
    expect(await listTracks()).toEqual([])
  })

  it('creates a track with a generated id and no points yet', async () => {
    const track = await createTrack({ name: 'Morning hunt', startedAt: '2026-08-16T10:00:00.000Z' })

    expect(track.id).toBeTruthy()
    expect(track.points).toEqual([])
    expect(await listTracks()).toEqual([track])
  })

  it('persists point/distance updates as recording progresses', async () => {
    const track = await createTrack({ name: 'Track', startedAt: '2026-08-16T10:00:00.000Z' })

    await updateTrack(track.id, {
      points: [{ lat: 46.8, lng: -71.2, timestamp: '2026-08-16T10:00:05.000Z' }],
      distanceMeters: 0,
    })
    await updateTrack(track.id, {
      points: [
        { lat: 46.8, lng: -71.2, timestamp: '2026-08-16T10:00:05.000Z' },
        { lat: 46.801, lng: -71.2, timestamp: '2026-08-16T10:00:10.000Z' },
      ],
      distanceMeters: 111,
    })

    const [reloaded] = await listTracks()
    expect(reloaded.points).toHaveLength(2)
    expect(reloaded.distanceMeters).toBe(111)
  })

  it('marks a track ended', async () => {
    const track = await createTrack({ name: 'Track', startedAt: '2026-08-16T10:00:00.000Z' })

    await updateTrack(track.id, { endedAt: '2026-08-16T11:00:00.000Z' })

    const [reloaded] = await listTracks()
    expect(reloaded.endedAt).toBe('2026-08-16T11:00:00.000Z')
  })

  it('deletes a track', async () => {
    const track = await createTrack({ name: 'Track', startedAt: '2026-08-16T10:00:00.000Z' })

    await deleteTrack(track.id)
    expect(await listTracks()).toEqual([])
  })
})
