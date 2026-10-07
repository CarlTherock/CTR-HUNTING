import { describe, expect, it } from 'vitest'
import { historyAnalyzer } from './analyzers'
import type { Observation, Track, Waypoint } from '@/types'

const COORD = { lat: 46.8, lng: -71.2 }

function waypoint(overrides: Partial<Waypoint>): Waypoint {
  return {
    id: 'wp',
    name: 'Test',
    coordinate: COORD,
    category: 'general',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

function track(id: string): Track {
  return {
    id,
    name: id,
    points: [{ ...COORD, timestamp: '2026-08-01T00:00:00.000Z' }],
    startedAt: '2026-08-01T00:00:00.000Z',
  }
}

describe('Observations : indices, visites, waypoints, journal', () => {
  it('seuls game_sign / kill_site / trail_camera sont comptés dans le score', () => {
    for (const category of ['game_sign', 'kill_site', 'trail_camera'] as const) {
      const result = historyAnalyzer(COORD, [waypoint({ category })], [])
      expect(result.score).toBeGreaterThan(50)
      expect(result.covered).toBe(true)
    }
    for (const category of ['general', 'stand_blind', 'water', 'parking'] as const) {
      const result = historyAnalyzer(COORD, [waypoint({ category })], [])
      expect(result.score).toBeNull()
    }
  })

  it('des waypoints non-indices sont affichés comme information, sans score', () => {
    const result = historyAnalyzer(COORD, [waypoint({ category: 'stand_blind' })], [])
    const info = result.factors.find(
      (f) => f.label === 'Autres points de repère enregistrés',
    )
    expect(info?.scored).toBe(false)
  })

  it('beaucoup de visites ne changent rien au score d’un secteur avec indice', () => {
    const signs = [waypoint({ category: 'game_sign' })]
    const base = historyAnalyzer(COORD, signs, [])
    const visited = historyAnalyzer(COORD, signs, [
      track('a'),
      track('b'),
      track('c'),
      track('d'),
    ])
    expect(visited.score).toBe(base.score)
    const visits = visited.factors.find((f) => f.label.startsWith('Visites'))
    expect(visits?.explanation).toMatch(/4 trace/)
    expect(visits?.explanation).toMatch(/biais d’effort d’observation/)
  })

  it('des visites seules ne rendent pas le groupe « renseigné » (elles documentent l’effort)', () => {
    const result = historyAnalyzer(COORD, [], [track('a')])
    expect(result.covered).toBe(false)
    expect(result.score).toBeNull()
  })

  it('les entrées de journal (texte libre) sont comptées en information, jamais interprétées', () => {
    const entry: Observation = {
      id: 'o1',
      coordinate: COORD,
      timestamp: '2026-08-01T00:00:00.000Z',
      notes: 'Vu 3 orignaux ici ce matin',
    }
    const result = historyAnalyzer(COORD, [], [], { observations: [entry] })
    const journal = result.factors.find((f) => f.label === 'Entrées de journal')
    expect(journal?.scored).toBe(false)
    expect(journal?.explanation).toMatch(/texte libre/)
    expect(journal?.explanation).toMatch(/aucune espèce ni aucun nombre/)
    expect(result.score).toBeNull()
  })

  it('dans une cellule, on cherche DANS le rectangle de la cellule, pas dans un rayon', () => {
    const cell = { south: 46.79, north: 46.81, west: -71.21, east: -71.19 }
    const inside = waypoint({
      category: 'game_sign',
      coordinate: { lat: 46.805, lng: -71.205 },
    })
    const outside = waypoint({
      category: 'game_sign',
      coordinate: { lat: 46.82, lng: -71.2 },
    })
    expect(
      historyAnalyzer(COORD, [inside], [], { cellBounds: cell }).score,
    ).toBeGreaterThan(50)
    expect(historyAnalyzer(COORD, [outside], [], { cellBounds: cell }).score).toBeNull()
  })
})
