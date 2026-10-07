import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { db } from '@/database/db'
import * as settingsRepository from '@/database/settingsRepository'
import { trackUnhandledRejections } from '@/test/unhandledRejections'
import { useLocalStorageProbe } from './useLocalStorageProbe'

afterEach(async () => {
  vi.restoreAllMocks()
  await db.settings.delete('hasOpenedSettings')
})

describe('useLocalStorageProbe', () => {
  it('reports a first opening, then an earlier one', async () => {
    const first = renderHook(() => useLocalStorageProbe())
    expect(first.result.current).toEqual({ status: 'checking' })
    await waitFor(() =>
      expect(first.result.current).toEqual({ status: 'ready', openedBefore: false }),
    )
    await waitFor(async () =>
      expect((await db.settings.get('hasOpenedSettings'))?.value).toBe(true),
    )

    const second = renderHook(() => useLocalStorageProbe())
    await waitFor(() =>
      expect(second.result.current).toEqual({ status: 'ready', openedBefore: true }),
    )
  })

  it('reports an error (not an endless "checking", not an unhandled rejection) when the database cannot be read', async () => {
    const tracker = trackUnhandledRejections()
    vi.spyOn(settingsRepository, 'getSetting').mockRejectedValue(new Error('idb down'))

    const { result } = renderHook(() => useLocalStorageProbe())

    await waitFor(() => expect(result.current).toEqual({ status: 'error' }))
    await tracker.settle()
    tracker.stop()
    expect(tracker.reasons).toEqual([])
  })

  it('keeps the answer and raises no unhandled rejection when recording the visit fails', async () => {
    const tracker = trackUnhandledRejections()
    vi.spyOn(settingsRepository, 'setSetting').mockRejectedValue(new Error('quota'))

    const { result } = renderHook(() => useLocalStorageProbe())

    await waitFor(() =>
      expect(result.current).toEqual({ status: 'ready', openedBefore: false }),
    )
    await tracker.settle()
    tracker.stop()
    expect(tracker.reasons).toEqual([])
  })
})
