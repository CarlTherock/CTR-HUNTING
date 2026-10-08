import { describe, expect, it } from 'vitest'
import type { GeolocationReading } from '@/features/gps/useGeolocation'
import { LOW_ACCURACY_METERS, resolveMarkerPosition } from './markerPosition'

const NOW = 1_000_000_000_000
const fix = (patch: Partial<{ ageMs: number; accuracyMeters: number }> = {}) =>
  ({
    status: 'available',
    confidence: 'measured',
    source: 'browser-geolocation',
    value: {
      lat: 46.8123456789,
      lng: -71.2,
      timestampMs: NOW - (patch.ageMs ?? 1000),
      ...(patch.accuracyMeters === undefined
        ? {}
        : { accuracyMeters: patch.accuracyMeters }),
    },
  }) as GeolocationReading

describe('resolveMarkerPosition', () => {
  it('uses a recent precise fix', () => {
    const result = resolveMarkerPosition(fix({ accuracyMeters: 5 }), NOW)
    expect(result).toMatchObject({
      kind: 'ready',
      lowAccuracy: false,
      freshness: 'recent',
    })
  })

  it('flags a low-accuracy fix and an unknown accuracy (never guessed from decimals)', () => {
    expect(
      resolveMarkerPosition(fix({ accuracyMeters: LOW_ACCURACY_METERS + 1 }), NOW),
    ).toMatchObject({ kind: 'ready', lowAccuracy: true })
    // Many decimals but no reported accuracy: still flagged as unknown.
    expect(resolveMarkerPosition(fix(), NOW)).toMatchObject({
      kind: 'ready',
      lowAccuracy: true,
    })
  })

  it('flags an old fix but refuses a stale one', () => {
    expect(
      resolveMarkerPosition(fix({ ageMs: 60_000, accuracyMeters: 5 }), NOW),
    ).toMatchObject({ kind: 'ready', freshness: 'old' })
    expect(
      resolveMarkerPosition(fix({ ageMs: 300_000, accuracyMeters: 5 }), NOW),
    ).toEqual({
      kind: 'unavailable',
      reason: 'stale',
    })
  })

  it('has no position without a fix (the map centre is never a substitute)', () => {
    const reading: GeolocationReading = {
      status: 'unavailable',
      kind: 'searching',
      reason: 'x',
    }
    expect(resolveMarkerPosition(reading, NOW)).toEqual({
      kind: 'unavailable',
      reason: 'no-fix',
    })
  })
})
