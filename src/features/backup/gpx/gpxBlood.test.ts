import { describe, expect, it } from 'vitest'
import type { Track, Waypoint } from '@/types'
import { buildGpx } from './gpxExport'
import { parseGpx } from './gpxImport'

const T = '2026-10-07T12:00:00.000Z'
const point = (lat: number) => ({ lat, lng: -71.2, timestamp: T })

const blood: Track = {
  id: 'b',
  name: 'Recherche',
  kind: 'blood',
  sessionId: 's1',
  startedAt: T,
  points: [point(46.8), point(46.801), point(46.9), point(46.901)],
  breaks: [2],
}
const green: Track = {
  id: 'g',
  name: 'Trajet',
  kind: 'normal',
  color: '#16a34a',
  startedAt: T,
  points: [point(46.7), point(46.701)],
}
const clue: Waypoint = {
  id: 'w',
  name: 'Sang 01',
  coordinate: { lat: 46.8, lng: -71.2, accuracyMeters: 5 },
  category: 'blood',
  sessionId: 's1',
  bloodKind: 'blood',
  origin: 'gps',
  createdAt: T,
  updatedAt: T,
}

describe('GPX and blood searches', () => {
  it('writes one <trkseg> per continuous segment (no line across a pause)', () => {
    const xml = buildGpx({ waypoints: [], tracks: [blood] })
    expect(xml.match(/<trkseg>/g)).toHaveLength(2)
  })

  it('round-trips segments, type, colour and the Sang category', () => {
    const xml = buildGpx({ waypoints: [clue], tracks: [blood, green] })
    const parsed = parseGpx(xml)
    const [b, g] = parsed.tracks
    expect(b.kind).toBe('blood')
    expect(b.breaks).toEqual([2])
    // The ~11 km jump between the two segments is not counted as distance.
    expect(b.distanceMeters).toBeLessThan(250)
    expect(g.kind).toBeUndefined()
    expect(g.color).toBe('#16a34a')
    expect(parsed.waypoints[0].category).toBe('blood')
  })

  it('does not import a red colour for a normal trip', () => {
    const xml = buildGpx({
      waypoints: [],
      tracks: [{ ...green, color: '#dc2626' }],
    })
    expect(parseGpx(xml).tracks[0].color).toBe('#3b82f6')
  })

  it('does not carry session links (documented limit)', () => {
    const parsed = parseGpx(buildGpx({ waypoints: [clue], tracks: [blood] }))
    expect('sessionId' in parsed.tracks[0]).toBe(false)
    expect('sessionId' in parsed.waypoints[0]).toBe(false)
  })
})
