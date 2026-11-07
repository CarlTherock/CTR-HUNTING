import { describe, expect, it } from 'vitest'
import type { PointForecast, PointHourly } from '@/types'
import { addDays } from '@/features/hunting-hours/zonedTime'
import { analyzeHunt, DEFAULT_PARAMS } from '@/features/deer-intel/engine'
import { recommend } from './recommendation'
import { summarizeObservations } from './observationsSummary'

/**
 * Sensibilité à la grille horaire — calcul réel (aucun score fabriqué) : MÊME point, MÊMES
 * dates, MÊME météo uniforme, mais blocs horaires décalés de 30 min (America/Toronto :00 contre
 * America/St_Johns :30). Un classement matin/soir qui dépend de la grille serait un artefact.
 */
const hourly = (d: string, h: number): PointHourly => ({
  time: `${d}T${String(h).padStart(2, '0')}:00`,
  temperatureCelsius: 2,
  apparentTemperatureCelsius: null,
  weatherCode: null,
  precipitationMm: 0,
  precipitationProbabilityPercent: null,
  relativeHumidityPercent: null,
  surfacePressureHpa: 1000,
  cloudCoverPercent: 20,
  visibilityMeters: null,
  uvIndex: null,
  windSpeedKmh: 12,
  windGustsKmh: 20,
  windDirectionDegrees: 270,
  isDay: null,
})

function delta(
  tz: string,
  date: string,
  field: 'meanIndex' | 'blockMeanIndex' | 'coreIndex',
) {
  const forecast: PointForecast = {
    timezone: tz,
    hourly: Array.from({ length: 24 }, (_, h) => hourly(date, h)),
    daily: [],
  }
  const day = analyzeHunt(
    {
      ...DEFAULT_PARAMS,
      coordinate: { lat: 45.6, lng: -72 },
      timezone: tz,
      startDateKey: date,
      days: 1,
      huntingRuleId: null,
    },
    forecast,
    { now: new Date('2026-11-07T11:00:00Z') },
  ).days[0]
  const r = recommend({
    day,
    timeZone: tz,
    territory: 'quebec',
    summary: summarizeObservations([], [], { timeZone: tz }),
    hasPostInfo: true,
  })
  const am = r.windows.find((w) => Number(w.startClock.slice(0, 2)) < 12)
  const pm = r.windows.find((w) => Number(w.startClock.slice(0, 2)) >= 12)
  return am && pm ? am[field] - pm[field] : null
}

function sweep(field: 'meanIndex' | 'blockMeanIndex' | 'coreIndex') {
  const gaps: number[] = []
  let flips = 0
  for (let i = 0; i < 90; i++) {
    const date = addDays('2026-10-01', i)
    const a = delta('America/Toronto', date, field)
    const b = delta('America/St_Johns', date, field)
    if (a === null || b === null) continue
    gaps.push(Math.abs(a - b))
    if (Math.sign(a) !== Math.sign(b)) flips++
  }
  gaps.sort((x, y) => x - y)
  return {
    n: gaps.length,
    flips,
    max: gaps[gaps.length - 1],
    med: gaps[gaps.length >> 1],
  }
}

describe('grille horaire décalée de 30 min', () => {
  it('le noyau de 60 min intégré ne dépend pas de la grille ; la moyenne du bloc entier en dépend', () => {
    const block = sweep('blockMeanIndex')
    const core = sweep('coreIndex')
    expect(core.n).toBeGreaterThan(30)
    // Avant correction : le bloc entier inversait le classement matin/soir sur la majorité des jours.
    expect(block.flips).toBeGreaterThan(core.n / 2)
    // Après correction : même point, même météo, grille décalée → même classement et même écart.
    expect(core.flips).toBe(0)
    expect(core.max).toBeLessThan(0.5)
  })

  it('découper un créneau aux limites change l’indice affiché (pas seulement l’heure)', () => {
    const date = '2026-11-07'
    const tz = 'America/Toronto'
    const forecast: PointForecast = {
      timezone: tz,
      hourly: Array.from({ length: 24 }, (_, h) => hourly(date, h)),
      daily: [],
    }
    const day = analyzeHunt(
      {
        ...DEFAULT_PARAMS,
        coordinate: { lat: 45.6, lng: -72 },
        timezone: tz,
        startDateKey: date,
        days: 1,
        huntingRuleId: null,
      },
      forecast,
      { now: new Date('2026-11-07T11:00:00Z') },
    ).days[0]
    const r = recommend({
      day,
      timeZone: tz,
      territory: 'quebec',
      summary: summarizeObservations([], [], { timeZone: tz }),
      hasPostInfo: true,
    })
    const clipped = r.windows.filter((w) => w.clipped)
    expect(clipped.length).toBeGreaterThan(0)
    for (const w of clipped) expect(w.meanIndex).not.toBeCloseTo(w.blockMeanIndex, 3)
  })
})
