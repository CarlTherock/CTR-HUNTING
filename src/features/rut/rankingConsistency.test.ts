import { describe, expect, it } from 'vitest'
import { rankDays, recommendationText } from './recommendationText'
import { rankWindows } from './recommendation'
import type { ClippedWindow, Recommendation } from './recommendation'
import { seasonalAdvice } from './seasonalAdvice'
import { localPlan } from './localPlan'

function slot(coreIndex: number, meanIndex = coreIndex, patch: Partial<ClippedWindow> = {}): ClippedWindow {
  return { startClock: '06:00', endClock: '08:00', minutes: 120, clipped: false, coreIndex, meanIndex, blockMeanIndex: meanIndex, evaluated: ['gust', 'precip'], notEvaluated: ['wind-direction'], composition: 'conditions_partielles', ...patch }
}
function recommendation(windows: ClippedWindow[]): Recommendation {
  return { methodVersion: 'test', seasonal: seasonalAdvice('2026-11-09', 'quebec'), windows, ranking: rankWindows(windows), missing: [], observationNote: null, separation: 'Test synthétique' }
}

describe('cohérence des classements', () => {
  it('le texte suit le noyau et non la moyenne globale', () => {
    const a = slot(80, 50), b = slot(60, 90, { startClock: '16:00', endClock: '18:00' })
    expect(recommendationText(recommendation([b, a])).headline).toContain('06:00–08:00')
  })
  it('le calendrier et le classement des jours ont le même gagnant', () => {
    const days = [{ dateKey: '2026-11-09', best: slot(80, 50) }, { dateKey: '2026-11-10', best: slot(60, 90) }]
    expect(rankDays(days).order[0]).toBe('2026-11-09')
    expect(localPlan('2026-11-09', 'quebec', days).bestDate).toBe(rankDays(days).order[0])
  })
  it('un écart sous trois points reste une égalité malgré des moyennes différentes', () => {
    const days = [{ dateKey: '2026-11-09', best: slot(72, 90) }, { dateKey: '2026-11-10', best: slot(70, 40) }]
    expect(rankDays(days).state).toBe('equivalents')
    expect(localPlan('2026-11-09', 'quebec', days).bestDate).toBeNull()
  })
  it('les facteurs différents ne sont jamais départagés', () => {
    const days = [{ dateKey: '2026-11-09', best: slot(80) }, { dateKey: '2026-11-10', best: slot(60, 60, { evaluated: ['precip'] }) }]
    expect(rankDays(days).state).toBe('non_comparables')
    expect(localPlan('2026-11-09', 'quebec', days).state).toBe('non_comparables')
  })
  it('un indice invalide ne devient pas un gagnant', () => {
    const days = [{ dateKey: '2026-11-09', best: slot(NaN) }, { dateKey: '2026-11-10', best: slot(60) }]
    expect(rankDays(days).state).toBe('insuffisant')
    expect(localPlan('2026-11-09', 'quebec', days).state).toBe('insuffisant')
  })
  it('ne modifie ni l’ordre ni les indices des entrées', () => {
    const windows = [slot(60), slot(80, 50, { startClock: '16:00', endClock: '18:00' })]
    const before = JSON.stringify(windows)
    recommendationText(recommendation(windows))
    expect(JSON.stringify(windows)).toBe(before)
  })
})
