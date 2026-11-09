import { describe, expect, it } from 'vitest'
import { localPlan } from './localPlan'
import type { DayRank } from './recommendationText'

function day(dateKey: string, coreIndex: number, meanIndex = coreIndex): DayRank {
  return { dateKey, best: { startClock: '06:00', endClock: '08:00', minutes: 120, clipped: false, meanIndex, coreIndex, blockMeanIndex: meanIndex, evaluated: ['gust', 'precip'], notEvaluated: ['wind-direction'], composition: 'conditions_partielles' } }
}

describe('localPlan', () => {
  it('uses the selected rolling week, not a fixed November week', () => {
    const p = localPlan('2026-12-29', 'quebec', [])
    expect(p.startKey).toBe('2026-12-29')
    expect(p.endKey).toBe('2027-01-04')
    expect(p.bestDate).toBeNull()
  })
  it('ranks equal-duration cores rather than full-window averages', () => {
    const p = localPlan('2026-11-09', 'quebec', [day('2026-11-09', 80, 50), day('2026-11-10', 65, 90)])
    expect(p.bestDate).toBe('2026-11-09')
    expect(p.state).toBe('departage')
  })
  it('does not manufacture a winning day for tiny differences', () => {
    const p = localPlan('2026-11-09', 'quebec', [day('2026-11-09', 70), day('2026-11-10', 72)])
    expect(p.state).toBe('equivalents')
    expect(p.bestDate).toBeNull()
  })
  it('refuses different factor coverage', () => {
    const a = day('2026-11-09', 80), b = day('2026-11-10', 60)
    b.best!.evaluated = ['gust']
    expect(localPlan('2026-11-09', 'quebec', [a, b]).state).toBe('non_comparables')
  })
  it('excludes activity-only, invalid and out-of-week indices', () => {
    const a = day('2026-11-09', 80)
    a.best!.composition = 'activite_seule'
    expect(localPlan('2026-11-09', 'quebec', [a, day('2026-11-10', NaN), day('2026-11-16', 90)]).eligible).toHaveLength(0)
  })
  it('rejects invalid dates', () => {
    expect(() => localPlan('2026-02-30', 'quebec', [])).toThrow(RangeError)
  })
})
