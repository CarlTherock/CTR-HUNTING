import { describe, expect, it } from 'vitest'
import {
  NBSP,
  THIN_NBSP,
  formatAcresFr,
  formatDistanceMeters,
  formatHectaresFr,
  formatKilometersFr,
  formatMetersFr,
  formatNumberFr,
  formatSquareMetersFr,
} from './format'

describe('formatDistanceMeters', () => {
  it('uses meters below 1 km', () => {
    expect(formatDistanceMeters(0)).toBe('0 m')
    expect(formatDistanceMeters(999.4)).toBe('999 m')
  })

  it('uses the French decimal comma in kilometres, never a point', () => {
    expect(formatDistanceMeters(2310)).toBe('2,31 km')
    expect(formatDistanceMeters(1000)).toBe('1,00 km')
    expect(formatDistanceMeters(12_345)).toBe('12,35 km')
    expect(formatDistanceMeters(2310)).not.toContain('.')
  })
})

describe('French measure formatting', () => {
  it('groups thousands with a narrow no-break space and uses the decimal comma', () => {
    expect(formatNumberFr(12_345.6, 1)).toBe(`12${THIN_NBSP}345,6`)
    expect(formatNumberFr(1_234_567.891, 2)).toBe(`1${THIN_NBSP}234${THIN_NBSP}567,89`)
    expect(formatNumberFr(999, 0)).toBe('999')
    expect(formatNumberFr(1000, 0)).toBe(`1${THIN_NBSP}000`)
    expect(formatNumberFr(0.5, 1)).toBe('0,5')
  })

  it('never prints a point, -0, NaN or Infinity', () => {
    expect(formatNumberFr(-0.0001, 2)).toBe('0,00')
    expect(formatNumberFr(-1234.5, 1)).toBe(`-1${THIN_NBSP}234,5`)
    expect(formatNumberFr(Number.NaN)).toBe('—')
    expect(formatNumberFr(Number.POSITIVE_INFINITY)).toBe('—')
    expect(formatNumberFr(999.95, 1)).toBe(`1${THIN_NBSP}000,0`)
  })

  it('formats metres, kilometres, hectares, square metres and acres', () => {
    expect(formatMetersFr(12_345.6)).toBe(`12${THIN_NBSP}345,6${NBSP}m`)
    expect(formatMetersFr(0)).toBe(`0,0${NBSP}m`)
    expect(formatKilometersFr(12_345.6)).toBe(`12,35${NBSP}km`)
    expect(formatHectaresFr(34_500)).toBe(`3,45${NBSP}ha`)
    expect(formatSquareMetersFr(34_500.4)).toBe(`34${THIN_NBSP}500${NBSP}m²`)
    // 8.52 acres = 34 479 m² (8.52 x 4046.8564224)
    expect(formatAcresFr(8.52 * 4046.8564224)).toBe(`8,52${NBSP}acres`)
    expect(formatAcresFr(4046.8564224)).toBe(`1,00${NBSP}acre`)
    expect(formatAcresFr(0)).toBe(`0,00${NBSP}acre`)
  })

  it('leaves formatDistanceMeters untouched', () => {
    expect(formatDistanceMeters(12_345)).toBe('12,35 km')
  })
})
