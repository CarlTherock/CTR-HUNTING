import { describe, expect, it } from 'vitest'
import { analyzeCellAtHour, computeCellStatics } from '@/features/analytics/heatmapEngine'
import { NOW, TZ, makeWeather, makeWindField } from '@/features/analytics/testFixtures'
import { combineAnalyses, unavailableResult } from '@/utils/analyzers'
import { ANALYZER_IDS } from '@/utils/analysisFamilies'
import { resolveHour } from '@/utils/analysisTime'
import type { VegetationSample } from '@/types'
import { explainAnalysis } from './explain'
import type { ExplainSubject } from './explain'
import { deterministicNatureOf } from './nature'
import { findTraceabilityProblems } from './validate'
import type { AssistantResult } from './types'

const A = { lat: 46.8, lng: -71.2 }
const B = { lat: 46.85, lng: -71.25 }
const FOREST: VegetationSample = {
  coordinate: A,
  radiusMeters: 400,
  categoryCounts: { forest: 3, water: 1 },
  source: 'openstreetmap',
}
const DEVELOPED: VegetationSample = { ...FOREST, categoryCounts: { developed: 2 } }
const hour = resolveHour(null, NOW, TZ)
const inputs = {
  windField: makeWindField([A, B], () => ({ speedKmh: 14 })),
  weather: makeWeather(() => ({})),
}

function subject(
  id: string,
  coordinate: typeof A,
  vegetation: VegetationSample | null,
): ExplainSubject {
  const cell = analyzeCellAtHour(
    computeCellStatics(coordinate, () => 300, vegetation, [], []),
    hour,
    inputs,
  )
  return {
    ref: { kind: 'cell', id, label: `Cellule ${id}`, coordinate },
    combined: cell.combined,
    coordinate,
    hourLabel: hour.timeLabel,
    computedAt: '2026-08-17T18:10:00.000Z',
    sizeText: '≈ 280 m × 310 m',
  }
}

const textOf = (result: AssistantResult, heading?: string) =>
  result.sections
    .filter((s) => heading === undefined || s.heading.startsWith(heading))
    .flatMap((s) => s.statements.map((st) => st.text))
    .join('\n')

describe('explainAnalysis — une cellule', () => {
  const a = subject('1', A, FOREST)
  const result = explainAnalysis({ subject: a, now: NOW })

  it('annonce l’indice calculé, comment il est construit et sa couverture', () => {
    const head = textOf(result, 'Résultat')
    const score = Math.round(a.combined.overallScore ?? 0)
    expect(head).toContain(`Indice de repère ${score}/100`)
    expect(head).toContain('moyenne simple des scores des groupes')
    expect(head).toContain('pas une probabilité de présence')
    expect(head).toContain('Couverture :')
    expect(textOf(result, 'Comment le score')).toContain(
      'moyenne pondérée des contributions',
    )
    expect(textOf(result, 'Comment le score')).toContain(
      'Un groupe sans donnée n’est jamais remplacé par une valeur neutre',
    )
  })

  it('liste facteurs, poids, source et heure de chaque groupe par famille', () => {
    const headings = result.sections.map((s) => s.heading)
    expect(headings.some((h) => h.startsWith('Habitat'))).toBe(true)
    expect(headings.some((h) => h.startsWith('Conditions'))).toBe(true)
    expect(headings.some((h) => h.startsWith('Observations'))).toBe(true)
    const conditions = textOf(result, 'Conditions')
    expect(conditions).toContain('contribution')
    expect(conditions).toContain('poids 1')
    expect(conditions).toContain('source : Open-Meteo')
    expect(conditions).toContain('actuel')
    expect(textOf(result, 'Habitat')).toContain('Couvert forestier')
  })

  it('donne à chaque facteur la nature de sa donnée (jamais « interprétation IA »)', () => {
    const factors = a.combined.results.flatMap((r) => r.factors)
    for (const factor of factors) {
      const statement = result.sections
        .flatMap((s) => s.statements)
        .find((s) => s.text.startsWith(`${factor.label} :`))
      expect(statement, factor.label).toBeDefined()
      expect(statement?.nature).toBe(deterministicNatureOf(factor.confidence))
    }
    const natures = new Set(
      result.sections.flatMap((s) => s.statements.map((s) => s.nature)),
    )
    expect(natures.has('interprétation IA' as never)).toBe(false)
  })

  it('dit les données manquantes et le contexte (heure, sources, facteurs)', () => {
    // Sans végétation chargée pour la cellule, le groupe est « manquant ».
    const without = explainAnalysis({ subject: subject('2', B, null), now: NOW })
    expect(textOf(without, 'Habitat')).toContain('Végétation : donnée manquante')
    expect(without.context.missingData.join(' ')).toContain('Végétation')
    expect(without.context.factors.length).toBeGreaterThan(0)
    expect(without.context.dates.map((d) => d.label).join(' ')).toContain(
      'Heure analysée',
    )
    expect(without.context.sources.length).toBeGreaterThan(0)
  })

  it('signale les facteurs valables pour toute la zone comme une limite', () => {
    expect(textOf(result, 'Limites')).toContain('identiques pour toute la zone')
    expect(textOf(result, 'Limites')).toContain('aucun profil d’espèce')
  })

  it('est traçable', () => {
    expect(findTraceabilityProblems(result)).toEqual([])
    expect(result.context.consulted.map((r) => r.id)).toEqual(['1'])
  })

  it('sans aucun score, dit qu’il n’y a pas d’indice plutôt que d’en inventer un', () => {
    const none = combineAnalyses(
      ANALYZER_IDS.map((id) => unavailableResult(id, 'rien chargé')),
    )
    const out = explainAnalysis({
      subject: { ...a, combined: none },
      now: NOW,
    })
    expect(textOf(out, 'Résultat')).toContain('Aucun indice')
    expect(out.context.missingData).toHaveLength(6)
    expect(findTraceabilityProblems(out)).toEqual([])
  })
})

describe('explainAnalysis — pourquoi deux cellules diffèrent', () => {
  const a = subject('1', A, FOREST)
  const b = subject('2', B, DEVELOPED)
  const result = explainAnalysis({ subject: a, other: b, now: NOW })
  const why = textOf(result, 'Pourquoi')

  it('nomme les facteurs d’habitat qui expliquent l’écart', () => {
    expect(why).toContain('Végétation — Couvert forestier')
    expect(why).toContain('Végétation — Terrain aménagé à proximité')
  })

  it('met à part les facteurs identiques parce qu’ils valent pour toute la zone', () => {
    expect(why).toContain('Facteurs identiques parce qu’ils s’appliquent à toute la zone')
  })

  it('donne l’écart global en points et le calcule à partir des indices', () => {
    const delta = Math.round(
      Math.abs((a.combined.overallScore ?? 0) - (b.combined.overallScore ?? 0)),
    )
    expect(why).toContain(`écart de +${delta} points`)
  })

  it('cite les deux cellules dans le contexte', () => {
    expect(result.context.consulted.map((r) => r.id).sort()).toEqual(['1', '2'])
    expect(findTraceabilityProblems(result)).toEqual([])
  })

  it('signale un manque d’un seul côté plutôt que de l’attribuer au terrain', () => {
    const c = subject('3', B, null)
    const out = explainAnalysis({ subject: a, other: c, now: NOW })
    expect(textOf(out, 'Pourquoi')).toContain(
      'Groupes dont une seule des deux analyses a la donnée',
    )
  })
})
