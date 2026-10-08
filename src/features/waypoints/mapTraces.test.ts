import { describe, expect, it } from 'vitest'
import { clueLinksGeoJson, splitSegments, tracesGeoJson } from '@/services/map/pathLayers'
import type { Track } from '@/types'
import { buildMapTraces } from './mapTraces'

const P = (lat: number) => ({ lat, lng: -71, timestamp: 'x' })
const old: Track = { id: 'old', name: 'Ancienne', points: [P(1), P(2)], startedAt: 'x' }
const blood: Track = {
  id: 'b',
  name: 'Sang',
  kind: 'blood',
  points: [P(3), P(4), P(5)],
  breaks: [2],
  startedAt: 'x',
}
const green: Track = {
  id: 'g',
  name: 'Vert',
  kind: 'normal',
  color: '#16a34a',
  points: [P(6), P(7)],
  startedAt: 'x',
}

describe('buildMapTraces', () => {
  it('draws every stored track with its own colour', () => {
    const traces = buildMapTraces([old, blood, green], 'all', null)
    expect(traces.map((t) => [t.id, t.kind, t.color])).toEqual([
      ['old', 'normal', '#3b82f6'],
      ['b', 'blood', '#dc2626'],
      ['g', 'normal', '#16a34a'],
    ])
  })

  it('applies the kind filter', () => {
    expect(buildMapTraces([old, blood, green], 'blood', null).map((t) => t.id)).toEqual([
      'b',
    ])
    expect(buildMapTraces([old, blood, green], 'normal', null).map((t) => t.id)).toEqual([
      'old',
      'g',
    ])
  })

  it('replaces the stored copy of the recording by its live points', () => {
    const live = { id: 'g', points: [P(6), P(7), P(8)], breaks: [] }
    const traces = buildMapTraces([green], 'all', live)
    expect(traces[0].points).toHaveLength(3)
  })
})

describe('segments', () => {
  it('splits at breaks and drops single-point segments', () => {
    expect(splitSegments([1, 2, 3, 4, 5], [2])).toEqual([
      [1, 2],
      [3, 4, 5],
    ])
    expect(splitSegments([1, 2, 3], [2])).toEqual([[1, 2]])
    expect(splitSegments([1], [])).toEqual([])
  })

  it('draws no line across a break', () => {
    const geo = tracesGeoJson(buildMapTraces([blood], 'all', null))
    // [P3,P4] and [P5] -> only the first segment is drawable.
    expect(geo.features[0].geometry.coordinates).toEqual([
      [
        [-71, 3],
        [-71, 4],
      ],
    ])
  })

  it('builds clue links only from pairs', () => {
    expect(clueLinksGeoJson(null).features).toEqual([])
    expect(
      clueLinksGeoJson([
        [{ lat: 1, lng: 1 }],
        [
          { lat: 1, lng: 1 },
          { lat: 2, lng: 2 },
        ],
      ]).features,
    ).toHaveLength(1)
  })
})
