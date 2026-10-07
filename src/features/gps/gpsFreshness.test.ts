import { describe, expect, it } from 'vitest'
import { formatAge, gpsAgeMs, gpsFreshness } from './gpsFreshness'

describe('gpsFreshness', () => {
  const now = 1_000_000

  it('is recent up to 15 s, old up to 120 s, stale beyond', () => {
    expect(gpsFreshness(now, now)).toBe('recent')
    expect(gpsFreshness(now, now - 15_000)).toBe('recent')
    expect(gpsFreshness(now, now - 15_001)).toBe('old')
    expect(gpsFreshness(now, now - 120_000)).toBe('old')
    expect(gpsFreshness(now, now - 120_001)).toBe('stale')
  })

  it('treats a future timestamp as fresh and an unknown one as stale', () => {
    expect(gpsFreshness(now, now + 5_000)).toBe('recent')
    expect(gpsFreshness(now, Number.NaN)).toBe('stale')
  })

  it('never reports a negative age', () => {
    expect(gpsAgeMs(now, now + 9_000)).toBe(0)
  })
})

describe('formatAge', () => {
  it('formats seconds, minutes and hours in French', () => {
    expect(formatAge(400)).toBe('à l’instant')
    expect(formatAge(12_000)).toBe('il y a 12 s')
    expect(formatAge(59_999)).toBe('il y a 59 s')
    expect(formatAge(180_000)).toBe('il y a 3 min')
    expect(formatAge(2 * 3_600_000 + 5_000)).toBe('il y a 2 h')
    expect(formatAge(Number.NaN)).toBe('âge inconnu')
  })
})
