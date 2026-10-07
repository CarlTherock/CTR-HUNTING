import { describe, expect, it } from 'vitest'
import { compassHeading, headingDifference, normalizeHeading } from './compassMath'

describe('compassHeading (absolute orientation -> magnetic heading)', () => {
  it('phone flat: heading of the top edge is 360 - alpha', () => {
    expect(compassHeading(0, 0, 0)).toBeCloseTo(0, 6)
    expect(compassHeading(90, 0, 0)).toBeCloseTo(270, 6)
    expect(compassHeading(270, 0, 0)).toBeCloseTo(90, 6)
  })

  it('phone flat: the screen rotation is added so forward = top of the screen', () => {
    // alpha 0 = top edge points north. Rotated 90 deg (landscape) the user
    // reads the screen with its "up" pointing east.
    expect(compassHeading(0, 0, 0, 90)).toBeCloseTo(90, 6)
    expect(compassHeading(0, 0, 0, 180)).toBeCloseTo(180, 6)
    expect(compassHeading(0, 0, 0, 270)).toBeCloseTo(270, 6)
  })

  it('phone upright (rear camera at the horizon): W3C formula, no screen correction', () => {
    expect(compassHeading(0, 90, 0)).toBeCloseTo(0, 6)
    expect(compassHeading(90, 90, 0)).toBeCloseTo(270, 6)
    expect(compassHeading(180, 90, 0)).toBeCloseTo(180, 6)
    expect(compassHeading(90, 90, 0, 90)).toBeCloseTo(270, 6)
  })

  it('phone upright in landscape (gamma -90): rear direction still correct', () => {
    // Rolled so the rear points along the original top-edge heading.
    expect(compassHeading(0, 0, -90)).toBeCloseTo(90, 6)
  })

  it('treats missing beta/gamma as flat and rejects a missing alpha', () => {
    expect(compassHeading(90, null, undefined)).toBeCloseTo(270, 6)
    expect(compassHeading(Number.NaN, 0, 0)).toBeNull()
  })
})

describe('heading helpers', () => {
  it('normalizes and measures differences across north', () => {
    expect(normalizeHeading(-10)).toBe(350)
    expect(normalizeHeading(360)).toBe(0)
    expect(headingDifference(359, 1)).toBe(2)
    expect(headingDifference(10, 190)).toBe(180)
  })
})
