import { describe, expect, it } from 'vitest'
import {
  formatLatitude,
  formatLongitude,
  formatSignedDecimal,
  formatSignedValue,
} from './coordinateFormat'

describe('coordinateFormat', () => {
  it('formats latitude with a decimal comma and N/S', () => {
    expect(formatLatitude(46.81389)).toBe('46,81389° N')
    expect(formatLatitude(-33.8688)).toBe('33,86880° S')
    expect(formatLatitude(0)).toBe('0,00000° N')
  })

  it('formats longitude with a decimal comma and E/O (ouest)', () => {
    expect(formatLongitude(-71.208)).toBe('71,20800° O')
    expect(formatLongitude(2.35)).toBe('2,35000° E')
  })

  it('shows 5 decimals only for display, it does not alter the value', () => {
    const lat = 46.813894567
    expect(formatLatitude(lat)).toBe('46,81389° N')
    expect(lat).toBe(46.813894567)
  })

  it('copies signed decimal degrees with dot decimals', () => {
    expect(formatSignedDecimal(46.81389, -71.208)).toBe('46.81389, -71.20800')
    expect(formatSignedDecimal(-0.000001, 0.000001)).toBe('0.00000, 0.00000')
    expect(formatSignedValue(-71.208)).toBe('-71.20800')
  })

  it('never prints NaN', () => {
    expect(formatLatitude(Number.NaN)).toBe('indisponible')
    expect(formatLongitude(Number.POSITIVE_INFINITY)).toBe('indisponible')
  })
})
