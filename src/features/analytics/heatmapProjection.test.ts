import { describe, expect, it } from 'vitest'
import { resolveHour } from '@/utils/analysisTime'
import { analyzeCellAtHour, computeCellStatics } from './heatmapEngine'
import { projectHeatmapCells } from './heatmapProjection'
import { NOW, TZ, makeWeather, makeWindField } from './testFixtures'

const A = { lat: 46.8, lng: -71.2 }
const hour = resolveHour(null, NOW, TZ)

function cell(vegetation: boolean) {
  return analyzeCellAtHour(
    computeCellStatics(
      A,
      () => 300,
      vegetation
        ? {
            coordinate: A,
            radiusMeters: 300,
            categoryCounts: { forest: 2 },
            source: 'openstreetmap',
          }
        : null,
      [],
      [],
    ),
    hour,
    { windField: makeWindField([A]), weather: makeWeather() },
  )
}

describe('projectHeatmapCells', () => {
  it('une cellule partiellement renseignée (végétation manquante) est marquée « partial »', () => {
    const [full] = projectHeatmapCells([cell(true)], 'combined', null)
    const [partial] = projectHeatmapCells([cell(false)], 'combined', null)
    expect(full.partial).toBe(false)
    expect(partial.partial).toBe(true)
    expect(partial.combined.overallScore).not.toBeNull()
  })

  it('l’absence d’observations (état normal) ne marque PAS la cellule comme partielle', () => {
    const [projected] = projectHeatmapCells([cell(true)], 'combined', null)
    expect(projected.combined.coverage?.missing).toEqual(['history'])
    expect(projected.partial).toBe(false)
  })

  it('la vue Observations sans indice saisi est « sans donnée » (null), pas un score bas', () => {
    const [projected] = projectHeatmapCells([cell(true)], 'observations', null)
    expect(projected.combined.overallScore).toBeNull()
  })

  it('la vue Habitat utilise la moyenne de la famille, la vue Conditions celle des conditions', () => {
    const source = cell(true)
    const [habitat] = projectHeatmapCells([source], 'habitat', null)
    const [conditions] = projectHeatmapCells([source], 'conditions', null)
    expect(habitat.combined.overallScore).toBe(source.combined.families?.[0].score)
    expect(conditions.combined.overallScore).toBe(source.combined.families?.[1].score)
  })

  it('une vue d’un seul analyseur reprend exactement son score (aucun étirement de contraste)', () => {
    const source = cell(true)
    const [wind] = projectHeatmapCells([source], 'wind', null)
    expect(wind.combined.overallScore).toBe(
      source.combined.results.find((r) => r.analyzer === 'wind')?.score,
    )
  })

  it('marque la cellule sélectionnée sans toucher aux scores', () => {
    const cells = [cell(true), cell(false)]
    const projected = projectHeatmapCells(cells, 'combined', 1)
    expect(projected.map((c) => c.selected)).toEqual([false, true])
    expect(projected[0].combined.overallScore).toBe(cells[0].combined.overallScore)
  })
})
