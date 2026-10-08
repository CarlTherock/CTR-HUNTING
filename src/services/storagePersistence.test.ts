import { afterEach, describe, expect, it, vi } from 'vitest'
import { getStoragePersistence, requestStoragePersistence } from './storagePersistence'

function stubStorage(storage: unknown) {
  vi.stubGlobal('navigator', { storage })
}

afterEach(() => vi.unstubAllGlobals())

describe('storagePersistence', () => {
  it('reports unavailable when the API is missing', async () => {
    stubStorage(undefined)
    expect(await getStoragePersistence()).toBe('unavailable')
    expect(await requestStoragePersistence()).toBe('unavailable')
    stubStorage({})
    expect(await requestStoragePersistence()).toBe('unavailable')
  })

  it('reports the real answer, granted or denied, never more', async () => {
    const persist = vi.fn().mockResolvedValue(false)
    stubStorage({ persisted: vi.fn().mockResolvedValue(false), persist })
    expect(await getStoragePersistence()).toBe('denied')
    expect(await requestStoragePersistence()).toBe('denied')
    expect(persist).toHaveBeenCalledTimes(1)

    stubStorage({
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockResolvedValue(true),
    })
    expect(await requestStoragePersistence()).toBe('granted')
  })

  it('does not ask again when already persistent', async () => {
    const persist = vi.fn()
    stubStorage({ persisted: vi.fn().mockResolvedValue(true), persist })
    expect(await requestStoragePersistence()).toBe('granted')
    expect(persist).not.toHaveBeenCalled()
  })

  it('degrades to unavailable when the browser throws', async () => {
    stubStorage({
      persisted: vi.fn().mockRejectedValue(new Error('boom')),
      persist: vi.fn().mockRejectedValue(new Error('boom')),
    })
    expect(await getStoragePersistence()).toBe('unavailable')
    expect(await requestStoragePersistence()).toBe('unavailable')
  })
})
