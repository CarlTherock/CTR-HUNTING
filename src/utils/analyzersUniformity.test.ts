import { describe, expect, it } from 'vitest'
import {
  combineAnalyses,
  historyAnalyzer,
  terrainAnalyzer,
  timeAnalyzer,
  weatherAnalyzer,
} from './analyzers'
import type { TemporalData, Track, WeatherConditions } from '@/types'

/**
 * Preuves des défauts d'uniformité / de score caché CONFIRMÉS dans le
 * moteur d'origine (chaque test décrit le comportement CORRECT ; ils
 * échouaient avant la correction — voir le rapport du commit).
 */

const COORDINATE = { lat: 46.8, lng: -71.2 }

const QUIET_DAY: TemporalData = {
  date: '2026-08-17',
  sun: {
    sunrise: '2026-08-17T09:45:00.000Z',
    sunset: '2026-08-17T23:51:00.000Z',
    dawn: null,
    dusk: null,
    solarNoon: '2026-08-17T16:48:00.000Z',
    goldenHourStart: null,
    goldenHourEnd: null,
    dayLengthMs: 14 * 3600_000,
  },
  moon: { rise: null, set: null, alwaysUp: false, alwaysDown: false },
  illumination: {
    fraction: 0.2,
    phase: 0.1,
    waxing: true,
    phaseName: 'Premier croissant',
  },
  solunarPeriods: [],
  moonTransit: {
    overhead: '2026-08-17T10:00:00.000Z',
    underfoot: '2026-08-17T22:00:00.000Z',
  },
}

const CALM_DRY: WeatherConditions = {
  timestamp: '2026-08-17T14:00',
  temperatureCelsius: 18,
  relativeHumidityPercent: 55,
  surfacePressureHpa: 1013,
  precipitationMm: 0,
  cloudCoverPercent: 30,
  windSpeedKmh: 2,
  windGustsKmh: 4,
  visibilityMeters: 20000,
}

describe('défauts confirmés : le « 50 neutre caché »', () => {
  it('Moment : sans aucun indice actif, ne renvoie PAS un 50 pesé dans la moyenne', () => {
    const midday = timeAnalyzer(QUIET_DAY, new Date('2026-08-17T16:00:00.000Z'))
    expect(midday.factors.filter((f) => f.scored !== false)).toHaveLength(0)
    expect(midday.score).toBeNull()
  })

  it('Météo : calme et sec, sans tendance de pression, ne renvoie PAS un 50 caché', () => {
    const result = weatherAnalyzer(CALM_DRY, [])
    expect(result.score).toBeNull()
  })

  it('un analyseur sans signal ne tire pas la moyenne combinée vers 50', () => {
    const terrain = terrainAnalyzer({ slopeDegrees: 12, aspectDegrees: 90 })
    const time = timeAnalyzer(QUIET_DAY, new Date('2026-08-17T16:00:00.000Z'))
    const alone = combineAnalyses([terrain]).overallScore
    const withSilentTime = combineAnalyses([terrain, time]).overallScore
    expect(withSilentTime).toBe(alone)
  })

  it('Observations : aucun enregistrement dans le rayon = pas de donnée (pas un 50)', () => {
    const result = historyAnalyzer(COORDINATE, [], [])
    expect(result.score).toBeNull()
  })

  it('Terrain : le facteur informatif « Exposition » (contribution 0) ne dilue pas la pente', () => {
    // pente modérée = +0.4 → 50 + 0.4 × 50 = 70
    expect(terrainAnalyzer({ slopeDegrees: 12, aspectDegrees: 90 }).score).toBeCloseTo(70)
  })
})

describe('défauts confirmés : étiquettes et doubles comptes', () => {
  it('Terrain : une pente de 22° n’est pas décrite comme « plutôt plat »', () => {
    const result = terrainAnalyzer({ slopeDegrees: 22, aspectDegrees: 90 })
    const slopeFactor = result.factors[0]
    expect(slopeFactor.explanation).not.toMatch(/plutôt plat/)
    expect(slopeFactor.label).not.toBe('Terrain doux ou plat')
  })

  it('Météo : le vent n’est pas compté deux fois quand le vent de la grille est disponible', () => {
    const windy = { ...CALM_DRY, windSpeedKmh: 40, precipitationMm: 0 }
    const result = weatherAnalyzer(windy, [], { includeWindSpeed: false })
    expect(result.factors.some((f) => /vent/i.test(f.label))).toBe(false)
  })
})

describe('défaut confirmé : les visites (traces) gonflaient la favorabilité', () => {
  const TRACK: Track = {
    id: 't1',
    name: 'Sortie',
    points: [{ lat: 46.8, lng: -71.2, timestamp: '2026-08-01T00:00:00.000Z' }],
    startedAt: '2026-08-01T00:00:00.000Z',
  }

  it('une trace proche ne donne aucun bonus de score (information / biais d’effort seulement)', () => {
    const without = historyAnalyzer(COORDINATE, [], [])
    const withTracks = historyAnalyzer(COORDINATE, [], [TRACK, { ...TRACK, id: 't2' }])
    expect(withTracks.score).toBe(without.score)
    const visits = withTracks.factors.find((f) => /visite/i.test(f.label))
    expect(visits?.scored).toBe(false)
    expect(visits?.contribution).toBe(0)
    expect(visits?.explanation).toMatch(/effort/i)
  })
})
