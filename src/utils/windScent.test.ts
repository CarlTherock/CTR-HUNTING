import { describe, expect, it } from 'vitest'
import { isScentDanger, windFlowDegrees } from './windScent'

describe('windScent', () => {
  it('the flow points the opposite way to the wind origin (from the south → toward the north)', () => {
    expect(windFlowDegrees(180)).toBe(0)
    expect(windFlowDegrees(270)).toBe(90)
    expect(windFlowDegrees(0)).toBe(180)
    expect(windFlowDegrees(350)).toBe(170)
  })

  it('danger when the flow heads into NW–N–NE (wind from SE, S or SW…)', () => {
    expect(isScentDanger(180)).toBe(true) // from S → flows N
    expect(isScentDanger(135)).toBe(true) // from SE → flows NW (315°)
    expect(isScentDanger(225)).toBe(true) // from SW → flows NE (45°)
    expect(isScentDanger(270)).toBe(false) // from W → flows E
    expect(isScentDanger(0)).toBe(false) // from N → flows S
    expect(isScentDanger(90)).toBe(false) // from E → flows W
  })
})
