import { describe, expect, it } from 'vitest'
import type { GeolocationReading } from '@/features/gps/useGeolocation'
import { guidanceView } from './guidanceView'
import type { GuidanceHeading } from './guidanceView'

const NOW = 50_000_000
// 0.001 degree of latitude ~ 111 m: a destination due north of the start.
const START = { lat: 46.8, lng: -71.2 }
const NORTH_111M = { lat: 46.801, lng: -71.2 }
const destination = { name: 'Mirador nord', coordinate: NORTH_111M }

function fix(
  ageMs: number,
  extra: Partial<{
    accuracyMeters: number
    lat: number
    lng: number
    courseDegrees: number
    speedMps: number
  }> = {},
): GeolocationReading {
  return {
    status: 'available',
    value: { ...START, timestampMs: NOW - ageMs, ...extra },
    confidence: 'measured',
    source: 'browser-geolocation',
  }
}

function unavailable(kind: 'denied' | 'searching' | 'unsupported'): GeolocationReading {
  return { status: 'unavailable', kind, reason: `raison-${kind}` }
}

const goodHeading = (trueHeading: number): GuidanceHeading => ({
  magneticHeading: trueHeading + 15,
  trueHeading,
  reliable: true,
  declinationDegrees: -15,
  warning: null,
})

describe('guidanceView — fresh fix', () => {
  const view = guidanceView({
    destination,
    gps: fix(2000, { accuracyMeters: 5 }),
    nowMs: NOW,
    heading: goodHeading(0),
  })

  it('gives distance, true bearing and its French cardinal label', () => {
    expect(view.mode).toBe('tracking')
    expect(view.freshness).toBe('recent')
    expect(view.notFresh).toBe(false)
    expect(view.notFreshNotice).toBeNull()
    expect(view.distanceMeters).toBeCloseTo(111.2, 0)
    expect(view.distanceText).toBe('111 m')
    expect(view.bearingTrueDegrees).toBeCloseTo(0, 3)
    expect(view.bearingCardinal).toBe('N')
    expect(view.bearingText).toBe('0° N (nord vrai)')
    expect(view.gps.accuracyText).toBe('Précision ±5 m')
  })

  it('draws the line from the fix to the destination', () => {
    expect(view.line).toEqual({ from: START, to: NORTH_111M })
  })

  it('formats long distances in km and uses French cardinals (O = ouest)', () => {
    const west = guidanceView({
      destination: { name: 'x', coordinate: { lat: 46.8, lng: -71.5 } },
      gps: fix(0),
      nowMs: NOW,
    })
    expect(west.distanceText).toMatch(/km$/)
    expect(west.bearingCardinal).toBe('O')
  })
})

describe('guidanceView — relative arrow', () => {
  const input = (heading: GuidanceHeading | null) => ({
    destination,
    gps: fix(0, { accuracyMeters: 5 }),
    nowMs: NOW,
    heading,
  })

  it('is relative to the phone: target north, phone facing east => 90 degrees to the left', () => {
    const view = guidanceView(input(goodHeading(90)))
    expect(view.arrow).toEqual({
      kind: 'relative',
      angleDegrees: -90,
      description: '90° à gauche',
    })
  })

  it('wraps across north', () => {
    const view = guidanceView(input(goodHeading(350)))
    expect(view.arrow).toMatchObject({ kind: 'relative', angleDegrees: 10 })
  })

  it('says straight ahead / behind', () => {
    expect(guidanceView(input(goodHeading(2))).arrow).toMatchObject({
      description: 'Droit devant',
    })
    expect(guidanceView(input(goodHeading(180))).arrow).toMatchObject({
      description: 'Derrière vous',
    })
  })

  it('has NO relative arrow without a heading, but still gives the bearing', () => {
    const view = guidanceView(input(null))
    expect(view.arrow.kind).toBe('none')
    expect((view.arrow as { reason: string }).reason).toMatch(
      /Cap du téléphone indisponible/,
    )
    expect(view.bearingText).toBe('0° N (nord vrai)')
  })

  it('has NO arrow from an unreliable heading', () => {
    const view = guidanceView(
      input({
        ...goodHeading(0),
        reliable: false,
        warning: 'Boussole peu fiable, calibrez-la.',
      }),
    )
    expect(view.arrow.kind).toBe('none')
    expect((view.arrow as { reason: string }).reason).toMatch(/peu fiable/)
  })

  it('has NO arrow from a magnetic-only heading (declination unknown)', () => {
    const view = guidanceView(
      input({ ...goodHeading(0), trueHeading: null, declinationDegrees: null }),
    )
    expect(view.arrow.kind).toBe('none')
    expect((view.arrow as { reason: string }).reason).toMatch(/déclinaison/)
  })

  it('has NO arrow while the compass has no reading', () => {
    const view = guidanceView(
      input({
        magneticHeading: null,
        trueHeading: null,
        reliable: false,
        declinationDegrees: null,
        warning: null,
        unavailableReason: 'Cap perdu : plus de lecture récente.',
      }),
    )
    expect(view.arrow.kind).toBe('none')
    expect((view.arrow as { reason: string }).reason).toMatch(/Cap perdu/)
  })

  it('never uses the GPS travel course as the phone heading', () => {
    const view = guidanceView({
      destination,
      // Moving east at 2 m/s: the course is 90, the destination is north.
      gps: fix(0, { accuracyMeters: 5, courseDegrees: 90, speedMps: 2 }),
      nowMs: NOW,
      heading: null,
    })
    expect(view.arrow.kind).toBe('none')
    expect(view.travelDirectionText).toBe('Direction de déplacement (GPS) : 90° E')
  })

  it('shows the travel direction only when actually moving', () => {
    const slow = guidanceView({
      destination,
      gps: fix(0, { courseDegrees: 90, speedMps: 0.4 }),
      nowMs: NOW,
    })
    expect(slow.travelDirectionText).toBeNull()
    const none = guidanceView({ destination, gps: fix(0), nowMs: NOW })
    expect(none.travelDirectionText).toBeNull()
  })
})

describe('guidanceView — old fix', () => {
  it('still computes but marks distance and direction "non fraîches" with the age', () => {
    const view = guidanceView({
      destination,
      gps: fix(45_000, { accuracyMeters: 5 }),
      nowMs: NOW,
      heading: goodHeading(0),
    })
    expect(view.mode).toBe('tracking')
    expect(view.freshness).toBe('old')
    expect(view.notFresh).toBe(true)
    expect(view.notFreshNotice).toMatch(/non fraîches/)
    expect(view.notFreshNotice).toMatch(/il y a 45 s/)
    expect(view.distanceText).toBe('111 m')
    expect(view.line).not.toBeNull()
    expect(view.travelDirectionText).toBeNull()
  })
})

describe('guidanceView — no usable position', () => {
  it('stale fix: nothing is computed from the supposed position', () => {
    const view = guidanceView({
      destination,
      gps: fix(10 * 60_000, { accuracyMeters: 5 }),
      nowMs: NOW,
      heading: goodHeading(0),
    })
    expect(view.mode).toBe('stale')
    expect(view.freshness).toBe('stale')
    expect(view.distanceMeters).toBeNull()
    expect(view.distanceText).toBeNull()
    expect(view.bearingTrueDegrees).toBeNull()
    expect(view.bearingText).toBeNull()
    expect(view.arrow.kind).toBe('none')
    expect(view.line).toBeNull()
    expect(view.unavailableReason).toMatch(/trop ancien/)
    expect(view.unavailableReason).toMatch(/il y a 10 min/)
  })

  it.each(['denied', 'searching', 'unsupported'] as const)(
    'GPS %s: shows the reason and no distance or direction',
    (kind) => {
      const view = guidanceView({
        destination,
        gps: unavailable(kind),
        nowMs: NOW,
        heading: goodHeading(0),
      })
      expect(view.mode).toBe('no-position')
      expect(view.freshness).toBe('none')
      expect(view.unavailableReason).toBe(`raison-${kind}`)
      expect(view.distanceText).toBeNull()
      expect(view.bearingText).toBeNull()
      expect(view.arrow.kind).toBe('none')
      expect(view.line).toBeNull()
    },
  )

  it('rejects an invalid GPS position instead of computing from it', () => {
    const view = guidanceView({
      destination,
      gps: fix(0, { lat: Number.NaN }),
      nowMs: NOW,
    })
    expect(view.mode).toBe('stale')
    expect(view.distanceText).toBeNull()
    expect(view.unavailableReason).toMatch(/invalide/)
  })

  it('has nothing to compute without a destination or with an invalid one', () => {
    expect(guidanceView({ destination: null, gps: fix(0), nowMs: NOW }).mode).toBe(
      'no-destination',
    )
    const bad = guidanceView({
      destination: { name: 'x', coordinate: { lat: Number.NaN, lng: 0 } },
      gps: fix(0),
      nowMs: NOW,
    })
    expect(bad.mode).toBe('no-destination')
    expect(bad.distanceText).toBeNull()
  })
})

describe('guidanceView — within the GPS uncertainty', () => {
  it('uses max(accuracy, 10 m): no arrow, no bearing, no "arrivé"', () => {
    const view = guidanceView({
      destination,
      gps: fix(0, { accuracyMeters: 150 }), // 111 m <= 150 m
      nowMs: NOW,
      heading: goodHeading(0),
    })
    expect(view.mode).toBe('within-uncertainty')
    expect(view.arrow.kind).toBe('none')
    expect(view.bearingText).toBeNull()
    expect(view.proximityMessage).toBe(
      'À proximité — la précision du GPS (±150 m) ne permet pas d’être plus précis.',
    )
    expect(JSON.stringify(view)).not.toMatch(/arriv/i)
  })

  it('applies a 10 m floor when the accuracy is better or unknown', () => {
    const near = { name: 'p', coordinate: { lat: 46.80005, lng: -71.2 } } // ~5.6 m
    const precise = guidanceView({
      destination: near,
      gps: fix(0, { accuracyMeters: 3 }),
      nowMs: NOW,
    })
    expect(precise.mode).toBe('within-uncertainty')
    expect(precise.proximityMessage).toContain('±3 m')
    const unknown = guidanceView({ destination: near, gps: fix(0), nowMs: NOW })
    expect(unknown.mode).toBe('within-uncertainty')
    expect(unknown.proximityMessage).toContain('inconnue')
  })

  it('leaves the zone just outside the threshold in tracking', () => {
    const view = guidanceView({
      destination,
      gps: fix(0, { accuracyMeters: 100 }), // 111 m > 100 m
      nowMs: NOW,
    })
    expect(view.mode).toBe('tracking')
  })
})
