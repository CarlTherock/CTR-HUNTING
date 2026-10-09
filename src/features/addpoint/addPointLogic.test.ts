import { describe, expect, it } from 'vitest'
import type { GeolocationReading } from '@/features/gps/useGeolocation'
import { buildAnimalObservation, describeGps } from './addPointLogic'

const NOW = 1_000_000
const fix = (ageMs: number, accuracy?: number): GeolocationReading => ({
  status: 'available',
  confidence: 'measured',
  source: 'browser-geolocation',
  value: {
    lat: 46.8,
    lng: -71.2,
    timestampMs: NOW - ageMs,
    ...(accuracy === undefined ? {} : { accuracyMeters: accuracy }),
  },
})

describe('describeGps', () => {
  it('reports accuracy and age of a usable fix', () => {
    const view = describeGps(fix(3000, 8), NOW)
    expect(view.usable).toBe(true)
    expect(view.coordinate).toMatchObject({ lat: 46.8, lng: -71.2, accuracyMeters: 8 })
    expect(view.line).toBe('±8 m · il y a 3 s')
    expect(view.lowAccuracy).toBe(false)
  })

  it('flags a poor or unknown accuracy and an old fix', () => {
    expect(describeGps(fix(1000, 60), NOW).line).toContain('précision faible')
    expect(describeGps(fix(1000), NOW).line).toContain('précision inconnue')
    expect(describeGps(fix(40_000, 5), NOW).line).toContain('un peu ancienne')
  })

  it('never offers a coordinate without a fresh enough fix', () => {
    const stale = describeGps(fix(10 * 60_000, 5), NOW)
    expect(stale.usable).toBe(false)
    expect(stale.coordinate).toBeNull()
    const none = describeGps(
      { status: 'unavailable', kind: 'denied', reason: 'Autorisation refusée.' },
      NOW,
    )
    expect(none.usable).toBe(false)
    expect(none.coordinate).toBeNull()
    expect(none.line).toContain('Autorisation refusée.')
  })
})

describe('buildAnimalObservation', () => {
  it('a deer entry is a DeerTracker entry with only the typed fields', () => {
    expect(
      buildAnimalObservation('deer', {
        kind: 'track',
        count: '2',
        notes: ' près du ruisseau ',
      }),
    ).toEqual({ notes: 'près du ruisseau', deer: { kind: 'track', count: 2 } })
    expect(
      buildAnimalObservation('deer', { kind: 'sighting', count: '', notes: '' }),
    ).toEqual({
      notes: '',
      deer: { kind: 'sighting' },
    })
  })

  it('a moose entry never carries a deer record, so deer statistics stay deer-only', () => {
    const built = buildAnimalObservation('moose', {
      kind: 'sighting',
      count: '1',
      notes: 'lisière',
    })
    expect(built.deer).toBeUndefined()
    expect(built.species).toBe('moose')
    expect(built.notes).toBe('Orignal — Animal observé × 1. lisière')
  })

  it('ignores an invalid count', () => {
    expect(
      buildAnimalObservation('deer', { kind: 'sighting', count: '0', notes: '' }).deer,
    ).toEqual({ kind: 'sighting' })
  })
})
