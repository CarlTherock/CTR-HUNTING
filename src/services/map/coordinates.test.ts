import { describe, expect, it } from 'vitest'
import { isValidCoordinate } from './coordinates'

describe('isValidCoordinate', () => {
  it('accepts ordinary and boundary coordinates', () => {
    expect(isValidCoordinate({ lat: 46.8, lng: -71.2 })).toBe(true)
    expect(isValidCoordinate({ lat: 90, lng: 180 })).toBe(true)
    expect(isValidCoordinate({ lat: -90, lng: -180 })).toBe(true)
    expect(isValidCoordinate({ lat: 0, lng: 0 })).toBe(true)
  })

  it('rejects NaN, infinite, out-of-range, null and undefined', () => {
    expect(isValidCoordinate({ lat: NaN, lng: 0 })).toBe(false)
    expect(isValidCoordinate({ lat: 0, lng: Infinity })).toBe(false)
    expect(isValidCoordinate({ lat: 91, lng: 0 })).toBe(false)
    expect(isValidCoordinate({ lat: 0, lng: -181 })).toBe(false)
    expect(isValidCoordinate(null)).toBe(false)
    expect(isValidCoordinate(undefined)).toBe(false)
  })
})
