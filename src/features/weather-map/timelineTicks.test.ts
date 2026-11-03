import { describe, expect, it } from 'vitest'
import type { WeatherMapFrame } from '@/types'
import { timelineTicks } from './timelineTicks'

function frames(n: number, startHour = 0): WeatherMapFrame[] {
  return Array.from({ length: n }, (_, i) => ({
    time: new Date(2026, 10, 3, startHour + i, 0).toISOString(),
    kind: 'forecast' as const,
  })) as unknown as WeatherMapFrame[]
}

describe('timelineTicks', () => {
  it('never exceeds the requested number and always keeps both ends', () => {
    const ticks = timelineTicks(frames(48), 5)
    expect(ticks.length).toBeLessThanOrEqual(5)
    expect(ticks[0].index).toBe(0)
    expect(ticks[ticks.length - 1].index).toBe(47)
  })

  it('shows every frame when there are fewer frames than marks', () => {
    expect(timelineTicks(frames(3), 8).map((t) => t.index)).toEqual([0, 1, 2])
  })

  it('names the weekday where the day changes', () => {
    const ticks = timelineTicks(frames(30), 4)
    expect(ticks[0].label).toMatch(/^\d{1,2} h$/)
    expect(ticks.some((t) => /^[a-zé]+\.? \d{1,2} h$/i.test(t.label))).toBe(true)
  })

  it('handles an empty list', () => {
    expect(timelineTicks([], 5)).toEqual([])
  })
})
