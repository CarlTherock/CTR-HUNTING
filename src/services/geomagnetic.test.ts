import { afterEach, describe, expect, it, vi } from 'vitest'
import { __setGeomagnetismLoaderForTests, getDeclination } from './geomagnetic'

afterEach(() => {
  __setGeomagnetismLoaderForTests(null)
})

const QUEBEC = { lat: 46.81, lng: -71.2 }
const TODAY = new Date('2026-10-07T12:00:00Z')

describe('getDeclination (real WMM2025 model, local computation)', () => {
  it('is close to -14.8 degrees (west) at Québec City in October 2026', async () => {
    const declination = await getDeclination(QUEBEC, TODAY)
    expect(declination).not.toBeNull()
    expect(declination as number).toBeGreaterThan(-15.4)
    expect(declination as number).toBeLessThan(-14.3)
  })

  it('is positive (east) on the Pacific coast', async () => {
    const declination = await getDeclination({ lat: 49.28, lng: -123.12 }, TODAY)
    expect(declination as number).toBeGreaterThan(10)
  })

  it('returns null, never an extrapolated value, outside the model validity', async () => {
    expect(await getDeclination(QUEBEC, new Date('2031-01-01T00:00:00Z'))).toBeNull()
    expect(await getDeclination(QUEBEC, new Date('2010-01-01T00:00:00Z'))).toBeNull()
  })

  it('returns null for unusable input', async () => {
    expect(await getDeclination({ lat: Number.NaN, lng: 0 }, TODAY)).toBeNull()
    expect(await getDeclination({ lat: 95, lng: 0 }, TODAY)).toBeNull()
    expect(await getDeclination(QUEBEC, new Date('invalid'))).toBeNull()
  })
})

describe('getDeclination caching and failures', () => {
  it('evaluates once per cell and month', async () => {
    const point = vi.fn((_geoPoint: number[]) => ({ decl: -12 }))
    const model = vi.fn(() => ({ point }))
    __setGeomagnetismLoaderForTests(async () => ({ model }))

    const a = await getDeclination({ lat: 46.81, lng: -71.2 }, TODAY)
    const b = await getDeclination({ lat: 46.9, lng: -71.1 }, TODAY) // same 0.5 deg cell
    const c = await getDeclination({ lat: 48.1, lng: -71.2 }, TODAY) // another cell

    expect([a, b, c]).toEqual([-12, -12, -12])
    expect(point).toHaveBeenCalledTimes(2)
    expect(point.mock.calls[0]?.[0]).toEqual([46.75, -71.25])
  })

  it('returns null if the library cannot be loaded', async () => {
    __setGeomagnetismLoaderForTests(() => Promise.reject(new Error('chunk failed')))
    expect(await getDeclination(QUEBEC, TODAY)).toBeNull()
  })

  it('returns null if the model throws or yields a non-finite value', async () => {
    __setGeomagnetismLoaderForTests(async () => ({
      model: () => {
        throw new Error('Model is only valid from ...')
      },
    }))
    expect(await getDeclination(QUEBEC, TODAY)).toBeNull()

    __setGeomagnetismLoaderForTests(async () => ({
      model: () => ({ point: () => ({ decl: Number.NaN }) }),
    }))
    expect(await getDeclination(QUEBEC, TODAY)).toBeNull()
  })
})
