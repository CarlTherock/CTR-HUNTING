import { describe, expect, it } from 'vitest'
import {
  computeCoverage,
  isCovered,
  isPartiallyInformed,
  summarizeFamilies,
} from './analysisFamilies'
import { historyAnalyzer, terrainAnalyzer, unavailableResult } from './analyzers'

const COORD = { lat: 46.8, lng: -71.2 }

describe('couverture des facteurs', () => {
  const results = [
    terrainAnalyzer({ slopeDegrees: 12, aspectDegrees: 90 }),
    unavailableResult('vegetation', 'pas de donnée'),
    unavailableResult('weather', 'pas de donnée'),
    unavailableResult('wind', 'pas de donnée'),
    unavailableResult('time', 'pas de donnée'),
    historyAnalyzer(COORD, [], []),
  ]

  it('compte les groupes renseignés sur le total, et nomme ceux qui manquent', () => {
    const coverage = computeCoverage(results)
    expect(coverage.total).toBe(6)
    expect(coverage.available).toBe(1)
    expect(coverage.missing).toEqual(['vegetation', 'weather', 'wind', 'time', 'history'])
  })

  it('un groupe évalué sans signal (score null mais donnée présente) compte comme renseigné', () => {
    const quiet = { ...unavailableResult('time', ''), covered: true }
    expect(isCovered(quiet)).toBe(true)
    expect(isCovered(unavailableResult('time', 'x'))).toBe(false)
  })

  it('des observations absentes ne hachurent pas la carte ; une donnée environnementale absente oui', () => {
    expect(isPartiallyInformed({ available: 5, total: 6, missing: ['history'] })).toBe(
      false,
    )
    expect(isPartiallyInformed({ available: 5, total: 6, missing: ['vegetation'] })).toBe(
      true,
    )
  })
})

describe('familles', () => {
  it('la moyenne d’une famille n’inclut que les analyseurs qui ont un score', () => {
    const terrain = terrainAnalyzer({ slopeDegrees: 12, aspectDegrees: 90 }) // 70
    const [habitat] = summarizeFamilies([
      terrain,
      unavailableResult('vegetation', 'x'),
      unavailableResult('weather', 'x'),
      unavailableResult('wind', 'x'),
      unavailableResult('time', 'x'),
      historyAnalyzer(COORD, [], []),
    ])
    expect(habitat.family).toBe('habitat')
    expect(habitat.score).toBeCloseTo(70)
    expect(habitat.coverage).toEqual({ available: 1, total: 2, missing: ['vegetation'] })
  })

  it('une famille sans aucun score a un score null (jamais 50)', () => {
    const families = summarizeFamilies([
      unavailableResult('terrain', 'x'),
      unavailableResult('vegetation', 'x'),
    ])
    expect(families[0].score).toBeNull()
  })
})
