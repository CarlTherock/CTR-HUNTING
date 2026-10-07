import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { db } from '@/database/db'
import * as photosRepository from '@/database/photosRepository'
import { trackUnhandledRejections } from '@/test/unhandledRejections'
import { usePhotoGallery } from './usePhotoGallery'

const createObjectURL = vi.fn(() => 'blob:fake')
const revokeObjectURL = vi.fn()

beforeEach(() => {
  URL.createObjectURL = createObjectURL
  URL.revokeObjectURL = revokeObjectURL
})

afterEach(async () => {
  vi.restoreAllMocks()
  createObjectURL.mockClear()
  revokeObjectURL.mockClear()
  await db.photos.clear()
})

const waypoint = { kind: 'waypoint' as const, id: 'wp-1' }

describe('usePhotoGallery', () => {
  it('loads the photos of the owner and exposes object URLs', async () => {
    await photosRepository.addPhoto({ waypointId: 'wp-1', blob: new Blob(['a']) })
    await photosRepository.addPhoto({ waypointId: 'other', blob: new Blob(['b']) })

    const { result } = renderHook(() => usePhotoGallery(waypoint, [], vi.fn()))

    await waitFor(() => expect(result.current.photos).toHaveLength(1))
    expect(result.current.photos[0].url).toBe('blob:fake')
  })

  it('loads observation photos when the owner is an observation', async () => {
    await photosRepository.addPhoto({ observationId: 'obs-1', blob: new Blob(['a']) })

    const { result } = renderHook(() =>
      usePhotoGallery({ kind: 'observation', id: 'obs-1' }, [], vi.fn()),
    )

    await waitFor(() => expect(result.current.photos).toHaveLength(1))
  })

  it('adds a file, persists it and reports the new photoIds', async () => {
    const onChange = vi.fn()
    const { result } = renderHook(() => usePhotoGallery(waypoint, ['old'], onChange))

    await act(async () => {
      await result.current.addFile(new Blob(['x']))
    })

    expect(result.current.photos).toHaveLength(1)
    expect(onChange).toHaveBeenCalledWith(['old', result.current.photos[0].id])
    expect(await db.photos.count()).toBe(1)
  })

  it('deletes a photo and reports the remaining photoIds', async () => {
    const stored = await photosRepository.addPhoto({
      waypointId: 'wp-1',
      blob: new Blob(['a']),
    })
    const onChange = vi.fn()
    const { result } = renderHook(() =>
      usePhotoGallery(waypoint, [stored.id, 'keep'], onChange),
    )
    await waitFor(() => expect(result.current.photos).toHaveLength(1))

    await act(async () => {
      await result.current.remove(result.current.photos[0])
    })

    expect(result.current.photos).toHaveLength(0)
    expect(onChange).toHaveBeenCalledWith(['keep'])
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake')
    expect(await db.photos.count()).toBe(0)
  })

  it('shows an error instead of an unhandled rejection when the photos cannot be loaded', async () => {
    const tracker = trackUnhandledRejections()
    vi.spyOn(photosRepository, 'listPhotosForWaypoint').mockRejectedValue(
      new Error('idb down'),
    )

    const { result } = renderHook(() => usePhotoGallery(waypoint, [], vi.fn()))

    await waitFor(() =>
      expect(result.current.error).toBe('Impossible de charger les photos.'),
    )
    await tracker.settle()
    tracker.stop()
    expect(tracker.reasons).toEqual([])
  })

  it('shows an error and does not touch photoIds when saving a photo fails', async () => {
    const tracker = trackUnhandledRejections()
    vi.spyOn(photosRepository, 'addPhoto').mockRejectedValue(new Error('quota'))
    const onChange = vi.fn()
    const { result } = renderHook(() => usePhotoGallery(waypoint, [], onChange))

    await act(async () => {
      await result.current.addFile(new Blob(['x']))
    })

    expect(result.current.error).toBe('Impossible d’enregistrer la photo.')
    expect(onChange).not.toHaveBeenCalled()
    expect(result.current.photos).toHaveLength(0)
    await tracker.settle()
    tracker.stop()
    expect(tracker.reasons).toEqual([])
  })

  it('keeps the photo listed and photoIds untouched when deleting fails', async () => {
    const stored = await photosRepository.addPhoto({
      waypointId: 'wp-1',
      blob: new Blob(['a']),
    })
    vi.spyOn(photosRepository, 'deletePhoto').mockRejectedValue(new Error('locked'))
    const onChange = vi.fn()
    const { result } = renderHook(() => usePhotoGallery(waypoint, [stored.id], onChange))
    await waitFor(() => expect(result.current.photos).toHaveLength(1))

    await act(async () => {
      await result.current.remove(result.current.photos[0])
    })

    expect(result.current.error).toBe('Impossible de supprimer la photo.')
    expect(result.current.photos).toHaveLength(1)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not create an object URL for a photo that finishes saving after unmount', async () => {
    let finish: (photo: Awaited<ReturnType<typeof photosRepository.addPhoto>>) => void =
      vi.fn()
    vi.spyOn(photosRepository, 'addPhoto').mockImplementation(
      () => new Promise((resolve) => (finish = resolve)),
    )
    const onChange = vi.fn()
    const { result, unmount } = renderHook(() => usePhotoGallery(waypoint, [], onChange))
    await waitFor(() => expect(createObjectURL).not.toHaveBeenCalled())

    let pending: Promise<void> = Promise.resolve()
    act(() => {
      pending = result.current.addFile(new Blob(['x']))
    })
    unmount()
    await act(async () => {
      finish({
        id: 'p1',
        waypointId: 'wp-1',
        blob: new Blob(['x']),
        originalBlob: new Blob(['x']),
        createdAt: '2026-01-01T00:00:00.000Z',
      })
      await pending
    })

    // The URL would never be revoked (the cleanup already ran) — a leak.
    expect(createObjectURL).not.toHaveBeenCalled()
    // The photo itself was saved, so its owner still gets the new id.
    expect(onChange).toHaveBeenCalledWith(['p1'])
  })
})
