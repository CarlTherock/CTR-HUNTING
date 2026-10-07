import { describe, expect, it } from 'vitest'
import type { Waypoint } from '@/types'
import {
  buildMapLink,
  buildPositionShare,
  buildWaypointShare,
  payloadToClipboardText,
  SNAPSHOT_SENTENCE,
} from './shareContent'
import { parseSharedPoint } from './sharedPoint'

describe('buildMapLink', () => {
  it.each([
    [
      { lat: 46.8139, lng: -71.208 },
      'https://www.google.com/maps/search/?api=1&query=46.8139%2C-71.208',
    ],
    [
      { lat: -33.8688, lng: 151.2093 },
      'https://www.google.com/maps/search/?api=1&query=-33.8688%2C151.2093',
    ],
    [{ lat: 0, lng: 0 }, 'https://www.google.com/maps/search/?api=1&query=0%2C0'],
    [
      { lat: -90, lng: -180 },
      'https://www.google.com/maps/search/?api=1&query=-90%2C-180',
    ],
    [
      { lat: 46.81389123, lng: -71.20800456 },
      'https://www.google.com/maps/search/?api=1&query=46.81389123%2C-71.20800456',
    ],
  ])('builds the official Google Maps URL for %j', (coordinate, expected) => {
    expect(buildMapLink(coordinate)).toBe(expected)
  })

  it('round-trips through new URL with the exact signed values', () => {
    const url = new URL(buildMapLink({ lat: -12.5, lng: -71.208 }))
    expect(url.origin).toBe('https://www.google.com')
    expect(url.pathname).toBe('/maps/search/')
    expect(url.searchParams.get('api')).toBe('1')
    expect(url.searchParams.get('query')).toBe('-12.5,-71.208')
  })
})

describe('buildWaypointShare', () => {
  const waypoint = {
    id: 'secret-id',
    name: 'Mirador nord',
    coordinate: { lat: 46.81389, lng: -71.208, altitude: 321, accuracyMeters: 4 },
    category: 'stand_blind',
    color: '#ef4444',
    notes: 'NOTE-PRIVEE-123',
    photoIds: ['photo-abc'],
    optimalWindDirections: [45],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-02-02T00:00:00.000Z',
  } satisfies Waypoint

  it('contains the name, both coordinate notations and a map link', () => {
    const payload = buildWaypointShare(waypoint)
    expect(payload.title).toBe('Mirador nord')
    expect(payload.text).toContain('Point : Mirador nord')
    expect(payload.text).toContain('Latitude : 46,81389° N (46.81389)')
    expect(payload.text).toContain('Longitude : 71,20800° O (-71.20800)')
    expect(payload.url).toBe(
      'https://www.google.com/maps/search/?api=1&query=46.81389%2C-71.208',
    )
    expect(payload.text).not.toContain('CTR Hunting')
  })

  it('adds the app root link only when an origin is given', () => {
    const payload = buildWaypointShare(waypoint, {
      origin: 'https://carltherock.github.io',
      baseUrl: '/CTR-HUNTING/',
    })
    expect(payload.text).toContain(
      'CTR Hunting : https://carltherock.github.io/CTR-HUNTING/?p=46.81389,-71.208&n=Mirador%20nord',
    )
    const link = payload.text.split('CTR Hunting : ')[1]
    expect(parseSharedPoint(new URL(link).search)).toMatchObject({
      kind: 'valid',
      point: { name: 'Mirador nord', coordinate: { lat: 46.81389, lng: -71.208 } },
    })
  })

  it('leaks nothing else: no notes, photos, ids, category, colour, wind, dates, altitude', () => {
    const everything = JSON.stringify(
      buildWaypointShare(waypoint, { origin: 'https://x.test', baseUrl: '/' }),
    )
    for (const secret of [
      'NOTE-PRIVEE-123',
      'photo-abc',
      'secret-id',
      'stand_blind',
      '#ef4444',
      '2026-01-01',
      '2026-02-02',
      '321',
      'altitude',
    ]) {
      expect(everything).not.toContain(secret)
    }
  })

  it('keeps the name plain text', () => {
    const payload = buildWaypointShare({
      name: '<b>Camp</b>\nligne 2',
      coordinate: { lat: 1, lng: 2 },
    })
    expect(payload.title).toBe('bCamp/b ligne 2')
    expect(payload.text).not.toMatch(/[<>]/)
  })
})

describe('buildPositionShare', () => {
  const position = {
    coordinate: { lat: 46.5, lng: -71.25, altitude: 100, accuracyMeters: 7.6 },
    accuracyMeters: 7.6,
    timestampMs: Date.UTC(2026, 9, 7, 14, 30, 0),
  }

  it('is a labelled snapshot with accuracy, time, link and the explicit sentence', () => {
    const payload = buildPositionShare(position, { timeZone: 'UTC' })
    expect(payload.title).toBe('Ma position (instantané)')
    expect(payload.text).toContain('Latitude : 46,50000° N (46.50000)')
    expect(payload.text).toContain('Longitude : 71,25000° O (-71.25000)')
    expect(payload.text).toContain('Précision : ±8 m')
    expect(payload.text).toMatch(/Relevé : .*2026/)
    expect(payload.text).toContain(SNAPSHOT_SENTENCE)
    expect(SNAPSHOT_SENTENCE).toBe('Instantané de ma position — pas un suivi en direct.')
    expect(payload.url).toBe(
      'https://www.google.com/maps/search/?api=1&query=46.5%2C-71.25',
    )
    expect(JSON.stringify(payload)).not.toContain('100')
  })

  it('says the accuracy is unknown rather than inventing one', () => {
    const payload = buildPositionShare({ ...position, accuracyMeters: undefined })
    expect(payload.text).toContain('Précision : inconnue')
  })
})

describe('payloadToClipboardText', () => {
  it('appends the map link to the text', () => {
    expect(payloadToClipboardText({ title: 't', text: 'a\nb', url: 'https://u' })).toBe(
      'a\nb\nhttps://u',
    )
  })
})
