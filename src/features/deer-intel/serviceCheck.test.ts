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
          : Promise.resolve({ ok: false, status: 504 }),
      ),
    )
    const r = await checkServices()
    expect(r).toHaveLength(2)
    expect(r.find((x) => x.host === 'api.open-meteo.com')?.ok).toBe(true)
    expect(r.find((x) => x.host === 'overpass-api.de')?.detail).toBe('HTTP 504')
  })
})
