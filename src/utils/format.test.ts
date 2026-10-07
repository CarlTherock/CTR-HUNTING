import { describe, expect, it } from 'vitest'
import { formatDistanceMeters } from './format'

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
