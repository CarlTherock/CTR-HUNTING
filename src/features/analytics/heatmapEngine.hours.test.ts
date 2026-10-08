import { describe, expect, it } from 'vitest'
import { resolveHour } from '@/utils/analysisTime'
import {
  analyzeCellAtHour,
  computeCellStatics,
  computeHeatmapCell,
} from './heatmapEngine'
import { NOW, NOW_KEY, TZ, makeWeather, makeWindField } from './testFixtures'
import type { AnalyzerId, AnalyzerResult, VegetationSample } from '@/types'

const COORD = { lat: 46.8, lng: -71.2 }
const FOREST: VegetationSample = {
  coordinate: COORD,
  radiusMeters: 500,
  categoryCounts: { forest: 2, water: 1 },
  source: 'openstreetmap',
}

function result(
  cell: ReturnType<typeof analyzeCellAtHour>,
  id: AnalyzerId,
): AnalyzerResult {
  const found = cell.combined.results.find((r) => r.analyzer === id)
  if (!found) throw new Error(`analyseur ${id} absent`)
  return found
}

const WEATHER = makeWeather((time) =>
  time === '2026-08-17T18:00'
    ? { precipitationMm: 7, windSpeedKmh: 45 } // forte pluie en soirée
    : {},
)
const WIND = makeWindField([COORD], (time) =>
  time === '2026-08-17T18:00' ? { speedKmh: 40 } : { speedKmh: 14 },
)

function cellAt(hourKey: string | null, windField = WIND, weather = WEATHER) {
  const statics = computeCellStatics(COORD, () => 300, FOREST, [], [])
  return analyzeCellAtHour(statics, resolveHour(hourKey, NOW, TZ), {
    windField,
    weather,
  })
}

describe('cohérence temporelle : l’heure choisie pilote météo, vent et moment', () => {
  it('« actuel » utilise le relevé actuel et l’étiquette « actuel »', () => {
    const weather = result(cellAt(null), 'weather')
    expect(weather.factors.length).toBeGreaterThan(0)
    expect(weather.factors.every((f) => f.timeLabel === 'actuel')).toBe(true)
    expect(weather.factors.every((f) => f.timeKind === 'current')).toBe(true)
    expect(weather.factors[0].dataTime).toBe('2026-08-17T14:15')
  })

  it('une heure future lit l’entrée horaire correspondante, pas le relevé actuel (défaut corrigé)', () => {
    const now = result(cellAt(null), 'weather')
    const evening = result(cellAt('2026-08-17T18:00'), 'weather')
    // Le soir : 7 mm/h → « Fortes précipitations » ; maintenant : sec.
    expect(evening.factors.some((f) => f.label === 'Fortes précipitations')).toBe(true)
    expect(now.factors.some((f) => f.label === 'Fortes précipitations')).toBe(false)
    expect(evening.factors.every((f) => f.timeLabel === 'prévision pour 18:00')).toBe(
      true,
    )
    expect(evening.factors.every((f) => f.timeKind === 'forecast')).toBe(true)
    expect(evening.factors[0].dataTime).toBe('2026-08-17T18:00')
  })

  it('le vent suit l’heure choisie et reçoit la même étiquette', () => {
    const now = result(cellAt(null), 'wind')
    const evening = result(cellAt('2026-08-17T18:00'), 'wind')
    expect(now.factors[0].label).toBe('Vent soutenu')
    expect(evening.factors[0].label).toBe('Vent fort')
    expect(evening.factors[0].timeLabel).toBe('prévision pour 18:00')
    expect(evening.factors[0].dataTime).toBe('2026-08-17T18:00')
  })

  it('une heure passée est étiquetée valeur de modèle, pas observation', () => {
    const past = result(cellAt('2026-08-17T09:00'), 'wind')
    expect(past.factors[0].timeKind).toBe('past')
    expect(past.factors[0].timeLabel).toBe('heure passée 09:00 (valeur de modèle)')
  })

  it('le moment solaire/lunaire est évalué à l’heure choisie et étiqueté non vérifié', () => {
    const evening = result(cellAt('2026-08-17T20:00'), 'time')
    // Coucher du soleil ≈ 19:50 locale à Québec en août : dans la fenêtre d’1 h.
    expect(evening.factors.some((f) => f.label.includes('aube et du crépuscule'))).toBe(
      true,
    )
    expect(evening.factors.every((f) => f.unverified === true)).toBe(true)
    const midday = result(cellAt(null), 'time')
    expect(midday.factors.some((f) => f.label.includes('aube et du crépuscule'))).toBe(
      false,
    )
  })

  it('une heure absente des données donne vent et météo indisponibles, sans extrapolation', () => {
    const cell = cellAt('2026-08-19T06:00')
    expect(result(cell, 'wind').score).toBeNull()
    expect(result(cell, 'wind').unavailableReason).toMatch(/pas dans les données de vent/)
    expect(result(cell, 'weather').score).toBeNull()
    expect(result(cell, 'weather').unavailableReason).toMatch(
      /pas dans les données météo/,
    )
  })

  it('l’ancienne API computeHeatmapCell accepte aussi une heure', () => {
    const cell = computeHeatmapCell(
      COORD,
      () => 300,
      WIND,
      WEATHER,
      FOREST,
      [],
      [],
      NOW,
      '2026-08-17T18:00',
    )
    expect(result(cell, 'weather').factors[0].timeLabel).toBe('prévision pour 18:00')
  })
})

describe('météo commune à toute la zone', () => {
  it('est marquée « identique sur toute la zone » avec sa limite (une seule requête au centre)', () => {
    const weather = result(cellAt(null), 'weather')
    for (const factor of weather.factors) {
      expect(factor.uniformAcrossArea).toBe(true)
      expect(factor.resolutionMeters).toBeNull()
      expect(factor.limits).toMatch(/au centre de la zone/)
      expect(factor.limits).toMatch(/AUCUNE variation locale/)
    }
  })

  it('deux cellules à météo identique ont la même météo : elle ne peut pas expliquer leur écart', () => {
    const a = computeCellStatics({ lat: 46.8, lng: -71.2 }, () => 300, FOREST, [], [])
    const b = computeCellStatics({ lat: 46.85, lng: -71.25 }, () => 330, null, [], [])
    const hour = resolveHour(null, NOW, TZ)
    const inputs = { windField: WIND, weather: WEATHER }
    const ca = analyzeCellAtHour(a, hour, inputs)
    const cb = analyzeCellAtHour(b, hour, inputs)
    expect(result(ca, 'weather').score).toBe(result(cb, 'weather').score)
  })

  it('le vent de la grille n’est pas compté une seconde fois dans la météo', () => {
    const withGrid = result(cellAt('2026-08-17T18:00'), 'weather')
    // Vent de 45 km/h dans la météo : ignoré tant qu’une lecture de grille existe.
    expect(withGrid.factors.some((f) => /^Vent/.test(f.label))).toBe(false)
    // Sans grille de vent, la météo garde son propre vent (repli honnête).
    const noGrid = result(cellAt('2026-08-17T18:00', null as never, WEATHER), 'weather')
    expect(noGrid.factors.some((f) => f.label === 'Vent fort')).toBe(true)
  })
})

describe('sans donnée ≠ peu favorable', () => {
  it('terrain et végétation manquants = analyseurs indisponibles et couverture réduite', () => {
    const statics = computeCellStatics(COORD, () => null, null, [], [])
    const cell = analyzeCellAtHour(statics, resolveHour(null, NOW, TZ), {
      windField: WIND,
      weather: WEATHER,
    })
    expect(result(cell, 'terrain').score).toBeNull()
    expect(result(cell, 'vegetation').score).toBeNull()
    const coverage = cell.combined.coverage
    expect(coverage?.missing).toEqual(expect.arrayContaining(['terrain', 'vegetation']))
    expect(coverage?.available).toBeLessThan(coverage?.total ?? 0)
  })

  it('une cellule sans AUCUNE donnée a un indice null (pas 0, pas 50)', () => {
    const statics = computeCellStatics(COORD, () => null, null, [], [])
    const cell = analyzeCellAtHour(statics, resolveHour(null, NOW, TZ), {
      windField: null,
      weather: null,
    })
    // Seul le calcul astronomique existe, et sans indice actif à 14 h.
    expect(cell.combined.overallScore).toBeNull()
    expect(cell.combined.coverage?.missing).toEqual(
      expect.arrayContaining(['terrain', 'vegetation', 'weather', 'wind', 'history']),
    )
  })

  it('une cellule réellement défavorable garde un score bas (non null)', () => {
    const rain = makeWeather(() => ({ precipitationMm: 9 }))
    const gale = makeWindField([COORD], () => ({ speedKmh: 60 }))
    const statics = computeCellStatics(
      COORD,
      (c) => 300 + (c.lat - 46.8) * 0, // plat
      { ...FOREST, categoryCounts: { developed: 3 } },
      [],
      [],
    )
    const cell = analyzeCellAtHour(statics, resolveHour('2026-08-17T10:00', NOW, TZ), {
      windField: gale,
      weather: rain,
    })
    expect(cell.combined.overallScore).not.toBeNull()
    expect(cell.combined.overallScore as number).toBeLessThan(50)
  })
})

describe('couverture et familles', () => {
  it('sépare Habitat / Conditions / Observations', () => {
    const cell = cellAt(null)
    const families = cell.combined.families ?? []
    expect(families.map((f) => f.family)).toEqual([
      'habitat',
      'conditions',
      'observations',
    ])
    expect(families[0].analyzers).toEqual(['terrain', 'vegetation'])
    expect(families[1].analyzers).toEqual(['weather', 'wind', 'time'])
    expect(families[2].analyzers).toEqual(['history'])
    // Rien d’enregistré : la famille Observations n’a PAS de score.
    expect(families[2].score).toBeNull()
  })

  it('le texte de couverture se calcule sur les 6 groupes de facteurs', () => {
    const cell = cellAt(null)
    expect(cell.combined.coverage?.total).toBe(6)
    // terrain, végétation, météo, vent, moment renseignés ; historique non.
    expect(cell.combined.coverage?.available).toBe(5)
    expect(cell.combined.coverage?.missing).toEqual(['history'])
  })

  it('NOW_KEY reste cohérent avec la fixture', () => {
    expect(resolveHour(null, NOW, TZ).hourKey).toBe(NOW_KEY)
  })
})
