import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkServices } from './serviceCheck'

describe('checkServices', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('rapporte le constat réel de chaque service (code HTTP ou cause)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.includes('open-meteo')
          ? Promise.resolve({ ok: true, status: 200 })
          : url.includes('kumi')
            ? Promise.reject(new TypeError('Failed to fetch'))
            : Promise.resolve({ ok: false, status: 504 }),
      ),
    )
    const r = await checkServices()
    expect(r).toHaveLength(3)
    expect(r.find((x) => x.host === 'api.open-meteo.com')?.ok).toBe(true)
    expect(r.find((x) => x.host === 'overpass-api.de')?.detail).toBe('HTTP 504')
    expect(r.find((x) => x.host === 'overpass.kumi.systems')?.detail).toContain(
      'Failed to fetch',
    )
  })
})
