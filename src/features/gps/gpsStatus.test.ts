import { describe, expect, it } from 'vitest'
import { gpsStatusView } from './gpsStatus'
import type { GeolocationReading } from './useGeolocation'

const NOW = 10_000_000

function fix(ageMs: number, accuracyMeters?: number): GeolocationReading {
  return {
    status: 'available',
    value: { lat: 46.8, lng: -71.2, accuracyMeters, timestampMs: NOW - ageMs },
    confidence: 'measured',
    source: 'browser-geolocation',
  }
}

describe('gpsStatusView', () => {
  it('labels a recent fix Disponible with accuracy and age', () => {
    const view = gpsStatusView(fix(3000, 8.4), NOW)
    expect(view).toMatchObject({
      label: 'Disponible',
      shareable: true,
      accuracyText: 'Précision ±8 m',
      ageText: 'relevé il y a 3 s',
    })
  })

  it('labels an old fix Ancien (still shareable) and a stale one not shareable', () => {
    expect(gpsStatusView(fix(60_000, 5), NOW)).toMatchObject({
      label: 'Ancien',
      shareable: true,
      ageText: 'relevé il y a 1 min',
    })
    expect(gpsStatusView(fix(300_000, 5), NOW)).toMatchObject({
      label: 'Ancien',
      shareable: false,
      warning: 'Ce relevé est trop ancien pour être partagé.',
    })
  })

  it('never invents an accuracy', () => {
    expect(gpsStatusView(fix(0), NOW).accuracyText).toBe('Précision inconnue')
  })

  it.each([
    ['searching', 'Recherche…'],
    ['denied', 'Refusé'],
    ['unsupported', 'Indisponible'],
    ['unavailable', 'Indisponible'],
    ['timeout', 'Indisponible'],
  ] as const)('maps the %s reading to %s with its reason', (kind, label) => {
    const view = gpsStatusView({ status: 'unavailable', kind, reason: 'raison' }, NOW)
    expect(view).toMatchObject({
      label,
      shareable: false,
      reason: 'raison',
      accuracyText: null,
      ageText: null,
    })
  })
})
