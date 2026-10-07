import { describe, expect, it } from 'vitest'
import { resolveHour } from '@/utils/analysisTime'
import { compareSlots, diffAnalyses } from './cellDiff'
import { analyzeCellAtHour, computeCellStatics } from './heatmapEngine'
import { NOW, TZ, makeWeather, makeWindField } from './testFixtures'
import type { VegetationSample } from '@/types'

const A = { lat: 46.8, lng: -71.2 }
const B = { lat: 46.85, lng: -71.25 }
const WEATHER = makeWeather((time) =>
  time === '2026-08-17T18:00' ? { precipitationMm: 7 } : {},
)
const WIND = makeWindField([A, B], (time) =>
  time === '2026-08-17T18:00' ? { speedKmh: 40 } : { speedKmh: 14 },
)
const FOREST: VegetationSample = {
  coordinate: A,
  radiusMeters: 400,
  categoryCounts: { forest: 3, water: 1 },
  source: 'openstreetmap',
}
const DEVELOPED: VegetationSample = { ...FOREST, categoryCounts: { developed: 2 } }

describe('diffAnalyses : pourquoi deux cellules diffèrent', () => {
  const hour = resolveHour(null, NOW, TZ)
  const inputs = { windField: WIND, weather: WEATHER }
  const a = analyzeCellAtHour(
    computeCellStatics(A, () => 300, FOREST, [], []),
    hour,
    inputs,
  ).combined
  const b = analyzeCellAtHour(
    computeCellStatics(B, () => 300, DEVELOPED, [], []),
    hour,
    inputs,
  ).combined
  const diff = diffAnalyses(a, b)

  it('explique l’écart par des facteurs d’habitat, pas par la météo commune', () => {
    const labels = diff.differing.map((d) => d.label)
    expect(labels).toEqual(
      expect.arrayContaining(['Couvert forestier', 'Terrain aménagé à proximité']),
    )
    expect(diff.differing.every((d) => d.analyzer === 'vegetation')).toBe(true)
  })

  it('classe les facteurs du plus au moins influent', () => {
    const magnitudes = diff.differing.map((d) => Math.abs(d.delta))
    expect([...magnitudes].sort((x, y) => y - x)).toEqual(magnitudes)
  })

  it('liste séparément les facteurs identiques parce qu’ils valent pour toute la zone', () => {
    expect(diff.sharedUniform.length).toBeGreaterThan(0)
    const weatherFactors = a.results
      .find((r) => r.analyzer === 'weather')
      ?.factors.filter((f) => f.scored !== false)
      .map((f) => f.label)
    for (const label of weatherFactors ?? []) {
      expect(diff.sharedUniform).toContain(label)
      expect(diff.differing.map((d) => d.label)).not.toContain(label)
    }
  })

  it('l’écart global est la différence des indices', () => {
    expect(diff.overall.delta).toBeCloseTo((a.overallScore ?? 0) - (b.overallScore ?? 0))
    expect(diff.families.find((f) => f.family === 'habitat')?.delta).not.toBeNull()
  })

  it('signale quand une donnée n’existe que d’un côté', () => {
    const without = analyzeCellAtHour(
      computeCellStatics(B, () => 300, null, [], []),
      hour,
      inputs,
    ).combined
    expect(diffAnalyses(a, without).coverageDiffers).toEqual(['vegetation'])
  })
})

describe('compareSlots : maintenant contre un autre créneau (calcul pur, sans requête)', () => {
  const statics = computeCellStatics(A, () => 300, FOREST, [], [])
  const inputs = { windField: WIND, weather: WEATHER }

  it('montre quels facteurs changent entre maintenant et ce soir', () => {
    const result = compareSlots(
      statics,
      resolveHour(null, NOW, TZ),
      resolveHour('2026-08-17T18:00', NOW, TZ),
      inputs,
    )
    const labels = result.difference.differing.map((d) => d.label)
    expect(labels).toEqual(expect.arrayContaining(['Fortes précipitations', 'Vent fort']))
    expect(result.difference.overall.delta as number).toBeGreaterThan(0)
    // Le terrain et la végétation ne changent pas avec l’heure.
    expect(
      result.difference.differing.some(
        (d) => d.analyzer === 'terrain' || d.analyzer === 'vegetation',
      ),
    ).toBe(false)
  })

  it('un créneau hors des données donne une donnée manquante, pas une valeur inventée', () => {
    const result = compareSlots(
      statics,
      resolveHour(null, NOW, TZ),
      resolveHour('2026-08-19T06:00', NOW, TZ),
      inputs,
    )
    expect(result.difference.coverageDiffers).toEqual(
      expect.arrayContaining(['weather', 'wind']),
    )
  })
})
