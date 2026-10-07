import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useUnwrappedAngle } from './useUnwrappedAngle'

describe('useUnwrappedAngle', () => {
  it('turns the short way across north in both directions and never jumps by more than 180', () => {
    const { result, rerender } = renderHook(({ angle }) => useUnwrappedAngle(angle), {
      initialProps: { angle: 350 as number | null },
    })
    expect(result.current).toBe(350)

    rerender({ angle: 10 })
    expect(result.current).toBe(370) // +20, not -340

    rerender({ angle: 350 })
    expect(result.current).toBe(350) // -20

    rerender({ angle: 170 })
    expect(Math.abs((result.current as number) - 350)).toBeLessThanOrEqual(180)
  })

  it('accumulates through repeated 359 -> 0 -> 359 wrap-arounds', () => {
    const { result, rerender } = renderHook(({ angle }) => useUnwrappedAngle(angle), {
      initialProps: { angle: 359 as number | null },
    })
    const seen: number[] = [result.current as number]
    for (const angle of [0, 359, 0, 1, 359]) {
      rerender({ angle })
      seen.push(result.current as number)
    }
    for (let i = 1; i < seen.length; i++) {
      expect(Math.abs(seen[i] - seen[i - 1])).toBeLessThanOrEqual(2)
    }
  })

  it('goes to null and restarts cleanly', () => {
    const { result, rerender } = renderHook(({ angle }) => useUnwrappedAngle(angle), {
      initialProps: { angle: 90 as number | null },
    })
    rerender({ angle: null })
    expect(result.current).toBeNull()
    rerender({ angle: 300 })
    expect(result.current).toBe(300)
  })
})
