import { describe, expect, it } from 'vitest'
import { NOW, makeWindField } from '@/features/analytics/testFixtures'
import { compareCaches } from '@/features/compare/compareCaches'
import type { CacheComparison, CompareCachesInput } from '@/features/compare/types'
import type { Coordinate, VegetationSample, Waypoint } from '@/types'
import { describeCacheComparison } from './cacheComparison'
import { HOSTILE_NOTE, entry, track, waypoint } from './testFixtures'
import { findTraceabilityProblems } from './validate'

const P1: Coordinate = { lat: 46.8, lng: -71.2 }
const P2: Coordinate = { lat: 46.82, lng: -71.25 }

function wp(id: string, coordinate: Coordinate, extra: Partial<Waypoint> = {}): Waypoint {
  return waypoint(id, {
    name: `Cache ${id}`,
    coordinate,
    category: 'stand_blind',
    optimalWindDirections: [270],
    ...extra,
  })
}

function vegetation(coordinate: Coordinate): VegetationSample {
  return {
    coordinate,
    radiusMeters: 300,
    categoryCounts: { forest: 2, water: 1 },
    source: 'openstreetmap',
  }
}

function input(
  waypoints: Waypoint[],
  overrides: Partial<CompareCachesInput> = {},
): CompareCachesInput {
  return {
    waypoints,
    hourKey: null,
    now: NOW,
    windField: makeWindField(waypoints.map((w) => w.coordinate)),
    wind: { status: 'ok', fetchedAt: '2026-08-17T18:10:00.000Z' },
    vegetation: waypoints.map((w) => vegetation(w.coordinate)),
    vegetationState: { status: 'ok', fetchedAt: '2026-08-17T18:11:00.000Z' },
    records: {
      waypoints,
      tracks: [
        track('t1', { points: [{ ...P1, timestamp: '2026-10-01T10:00:00.000Z' }] }),
      ],
      observations: [entry('j1', { coordinate: P1, notes: 'Chevreuil au matin' })],
      readAt: '2026-08-17T18:12:00.000Z',
    },
    gps: null,
    nowMs: NOW.getTime(),
    ...overrides,
  }
}

const all = (comparison: CacheComparison) =>
  describeCacheComparison(comparison, { now: NOW }).sections.flatMap((s) =>
    s.statements.map((st) => st.text),
  )

describe('describeCacheComparison — met en forme, ne recalcule pas', () => {
  const comparison = compareCaches(input([wp('a', P1), wp('b', P2)]))
  const result = describeCacheComparison(comparison, { now: NOW })

  it('reprend tel quel le résumé de classement du comparateur', () => {
    expect(all(comparison)).toContain(comparison.ranking.summary)
    // Preuve de lecture : un résumé modifié à la main se retrouve dans le texte.
    const tampered: CacheComparison = {
      ...comparison,
      ranking: { ...comparison.ranking, summary: 'RÉSUMÉ IMPOSÉ PAR LE TEST' },
    }
    expect(all(tampered)).toContain('RÉSUMÉ IMPOSÉ PAR LE TEST')
  })

  it('reprend les verdicts des 5 critères de chaque point, sans les modifier', () => {
    const texts = all(comparison)
    for (const row of comparison.rows) {
      for (const criterion of row.criteria) {
        expect(texts.some((t) => t.includes(criterion.detail.slice(0, 40)))).toBe(true)
      }
    }
  })

  it('reprend les règles et l’avertissement du comparateur', () => {
    const texts = all(comparison)
    for (const rule of comparison.rules) expect(texts).toContain(rule)
    expect(texts).toContain(comparison.disclaimer)
  })

  it('cite chaque point, ses signes de gibier, ses entrées et ses visites avec des liens', () => {
    const ids = result.context.consulted.map((r) => `${r.kind}:${r.id}`)
    expect(ids).toEqual(
      expect.arrayContaining(['waypoint:a', 'waypoint:b', 'journal:j1', 'track:t1']),
    )
    expect(findTraceabilityProblems(result)).toEqual([])
  })

  it('distingue valeur de modèle (estimation), enregistrement (fait) et verdict (calcul)', () => {
    const natureOf = (start: string) =>
      result.sections.flatMap((s) => s.statements).find((s) => s.text.startsWith(start))
        ?.nature
    expect(natureOf('Vent à')).toBe('estimation')
    expect(natureOf('Habitat :')).toBe('estimation')
    expect(natureOf('1 entrée de journal proche')).toBe('fait enregistré')
    expect(natureOf('Satisfait')).toBe('calcul')
  })

  it('porte les données manquantes dans le contexte (animaux observés, position)', () => {
    const missing = result.context.missingData.join(' | ')
    expect(missing).toContain('animaux observés')
    expect(missing).toContain('position')
    expect(result.originLabel).toBe('Calcul / résumé automatique')
  })
})

describe('describeCacheComparison — données manquantes et notes hostiles', () => {
  it('dit « non évaluable » quand le vent manque, sans valeur neutre', () => {
    const comparison = compareCaches(
      input([wp('a', P1), wp('b', P2)], {
        windField: null,
        wind: { status: 'error', reason: 'fournisseur indisponible' },
      }),
    )
    const result = describeCacheComparison(comparison, { now: NOW })
    const texts = result.sections
      .flatMap((s) => s.statements.map((st) => st.text))
      .join('\n')
    expect(texts).toContain('Non évaluable')
    expect(result.context.missingData.join(' ')).toContain('vent')
    expect(findTraceabilityProblems(result)).toEqual([])
  })

  it('une note ou un nom hostile reste une donnée tronquée', () => {
    const comparison = compareCaches(
      input([wp('a', P1, { name: HOSTILE_NOTE }), wp('b', P2)], {
        records: {
          waypoints: [wp('a', P1, { name: HOSTILE_NOTE }), wp('b', P2)],
          tracks: [],
          observations: [entry('j1', { coordinate: P1, notes: HOSTILE_NOTE })],
          readAt: null,
        },
      }),
    )
    const result = describeCacheComparison(comparison, { now: NOW })
    for (const ref of result.context.consulted)
      expect(ref.label.length).toBeLessThanOrEqual(80)
    const natures = new Set(
      result.sections.flatMap((s) => s.statements.map((st) => st.nature)),
    )
    expect(natures.has('interprétation IA' as never)).toBe(false)
    expect(findTraceabilityProblems(result)).toEqual([])
  })
})
