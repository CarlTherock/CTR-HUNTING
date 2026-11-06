import { describe, expect, it } from 'vitest'
import { scentZone, scentZoneLabels, windFlowDegrees } from './windScent'

describe('windScent', () => {
  it('the flow points the opposite way to the wind origin (from the south → toward the north)', () => {
    expect(windFlowDegrees(180)).toBe(0)
    expect(windFlowDegrees(270)).toBe(90)
    expect(windFlowDegrees(0)).toBe(180)
    expect(windFlowDegrees(350)).toBe(170)
  })

  it('the red zone is centred on the arrow tip and 90° wide (3 compass points)', () => {
    expect(scentZone(180)).toEqual({ start: -45, end: 45 }) // flows N
    expect(scentZone(270)).toEqual({ start: 45, end: 135 }) // flows E
    expect(scentZone(202)).toEqual({ start: -23, end: 67 }) // follows the real heading (22°)
  })

  it('names the three covered points', () => {
    expect(scentZoneLabels(180)).toEqual({ toward: 'N', span: 'NO–N–NE' })
    expect(scentZoneLabels(270)).toEqual({ toward: 'E', span: 'NE–E–SE' })
    expect(scentZoneLabels(0)).toEqual({ toward: 'S', span: 'SE–S–SO' })
    expect(scentZoneLabels(202)).toEqual({ toward: 'N', span: 'NO–N–NE' })
  })
})
