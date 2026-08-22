import { afterEach, describe, expect, it } from 'vitest'
import { db } from './db'
import {
  addPhoto,
  deletePhoto,
  deletePhotosForObservation,
  deletePhotosForWaypoint,
  listPhotosForObservation,
  listPhotosForWaypoint,
} from './photosRepository'

function fakeBlob(content = 'fake-image-bytes'): Blob {
  return new Blob([content], { type: 'image/jpeg' })
}

describe('photosRepository (IndexedDB via Dexie)', () => {
  afterEach(async () => {
    await db.photos.clear()
  })

  it('starts empty for a waypoint with no photos', async () => {
    expect(await listPhotosForWaypoint('w1')).toEqual([])
  })

  it('adds a photo with a generated id and timestamp', async () => {
    const photo = await addPhoto({ waypointId: 'w1', blob: fakeBlob() })

    expect(photo.id).toBeTruthy()
    expect(photo.waypointId).toBe('w1')
    expect(photo.createdAt).toBeTruthy()

    const [reloaded] = await listPhotosForWaypoint('w1')
    // fake-indexeddb's structured-clone (jsdom environment) doesn't
    // round-trip a Blob the way a real browser's IndexedDB does — assert
    // the fields that do survive rather than the blob itself. Real
    // Blob persistence is exercised in the browser, not here.
    expect(reloaded.id).toBe(photo.id)
    expect(reloaded.waypointId).toBe('w1')
  })

  it('only lists photos for the requested waypoint', async () => {
    await addPhoto({ waypointId: 'w1', blob: fakeBlob('a') })
    await addPhoto({ waypointId: 'w2', blob: fakeBlob('b') })

    const w1Photos = await listPhotosForWaypoint('w1')
    expect(w1Photos).toHaveLength(1)
    expect(w1Photos[0].waypointId).toBe('w1')
  })

  it('deletes a single photo', async () => {
    const photo = await addPhoto({ waypointId: 'w1', blob: fakeBlob() })

    await deletePhoto(photo.id)
    expect(await listPhotosForWaypoint('w1')).toEqual([])
  })

  it('deletePhotosForWaypoint removes every photo for that waypoint, leaving others untouched', async () => {
    await addPhoto({ waypointId: 'w1', blob: fakeBlob('a') })
    await addPhoto({ waypointId: 'w1', blob: fakeBlob('b') })
    await addPhoto({ waypointId: 'w2', blob: fakeBlob('c') })

    await deletePhotosForWaypoint('w1')

    expect(await listPhotosForWaypoint('w1')).toEqual([])
    expect(await listPhotosForWaypoint('w2')).toHaveLength(1)
  })

  it('adds a photo owned by an observation instead of a waypoint', async () => {
    const photo = await addPhoto({ observationId: 'o1', blob: fakeBlob() })

    expect(photo.observationId).toBe('o1')
    expect(photo.waypointId).toBeUndefined()
    const [reloaded] = await listPhotosForObservation('o1')
    expect(reloaded.id).toBe(photo.id)
  })

  it('only lists photos for the requested observation, separate from waypoint photos', async () => {
    await addPhoto({ observationId: 'o1', blob: fakeBlob('a') })
    await addPhoto({ waypointId: 'w1', blob: fakeBlob('b') })

    expect(await listPhotosForObservation('o1')).toHaveLength(1)
    expect(await listPhotosForWaypoint('w1')).toHaveLength(1)
  })

  it('deletePhotosForObservation removes only that observation\'s photos', async () => {
    await addPhoto({ observationId: 'o1', blob: fakeBlob('a') })
    await addPhoto({ observationId: 'o2', blob: fakeBlob('b') })

    await deletePhotosForObservation('o1')

    expect(await listPhotosForObservation('o1')).toEqual([])
    expect(await listPhotosForObservation('o2')).toHaveLength(1)
  })
})
