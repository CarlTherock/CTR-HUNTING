import { describe, expect, it } from 'vitest'
import type { PointForecast, PointHourly } from '@/types'
import { analyzeHunt, DEFAULT_PARAMS } from '@/features/deer-intel/engine'
import type { HuntParams } from '@/features/deer-intel/engine'
import { summarizeObservations } from './observationsSummary'
import { clipWindow, observationNote, rankWindows, recommend } from './recommendation'
import type { ClippedWindow } from './recommendation'
import { seasonalAdvice, seasonalStage } from './seasonalAdvice'

const TZ = 'America/Toronto'
const PT1 = { lat: 45.6, lng: -72.0 } // point de TEST, pas un lieu de l'utilisateur
const empty = summarizeObservations([], [], { timeZone: TZ })

function hour(d: string, h: number, over: Partial<PointHourly> = {}): PointHourly {
  return {
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
    ...over,
  }
}
/** Prévision SYNTHÉTIQUE de test (valeurs inventées pour le test). */
function forecast(d: string, over: Partial<PointHourly> = {}): PointForecast {
  return {
    timezone: TZ,
    hourly: Array.from({ length: 24 }, (_, h) => hour(d, h, over)),
    daily: [],
  }
}
function analyze(over: Partial<HuntParams>, f: PointForecast | null) {
  return analyzeHunt(
    {
      ...DEFAULT_PARAMS,
      coordinate: PT1,
      timezone: TZ,
      startDateKey: '2026-11-07',
      days: 1,
      huntingRuleId: 'quebec-general',
      ...over,
    },
    f,
    { now: new Date('2026-11-07T11:00:00Z') },
  ).days[0]
}

describe('conseil saisonnier : passage progressif', () => {
  it('étapes autour des bornes externes (23 oct. – 12 nov.)', () => {
    expect(seasonalStage('2026-10-01')).toBe('avant')
    expect(seasonalStage('2026-10-22')).toBe('approche')
    expect(seasonalStage('2026-10-23')).toBe('dans')
    expect(seasonalStage('2026-11-12')).toBe('dans')
    expect(seasonalStage('2026-11-13')).toBe('transition')
    expect(seasonalStage('2026-11-26')).toBe('transition')
    expect(seasonalStage('2026-11-27')).toBe('apres')
  })
  it('le lendemain de la borne ne devient pas « après le rut »', () => {
    const a = seasonalAdvice('2026-11-13', 'quebec')
    expect(a.headline).toMatch(/aucun verdict/i)
    expect(a.effect).toMatch(/pas un « après-rut » québécois/)
    expect(a.extendPresence.status).toBe('non_etaye')
  })
  it('dans le repère : conseil prudent, prolongation seulement comme option non démontrée', () => {
    const a = seasonalAdvice('2026-11-07', 'quebec')
    expect(a.extendPresence.status).toBe('option')
    expect(a.extendPresence.text).toMatch(/aucun pic de midi/)
    expect(a.dayRanking).toMatch(/ne départage pas/)
  })
  it('le contexte change bien le conseil entre les étapes (pas seulement le titre)', () => {
    const inside = seasonalAdvice('2026-11-07', 'quebec')
    const after = seasonalAdvice('2026-12-10', 'quebec')
    expect(inside.effect).not.toBe(after.effect)
    expect(inside.extendPresence.status).not.toBe(after.extendPresence.status)
  })
  it('hors territoire, Madeleine et Anticosti : aucun repère québécois appliqué', () => {
    for (const t of ['hors_territoire', 'madeleine', 'anticosti'] as const) {
      const a = seasonalAdvice('2026-11-07', t)
      expect(a.covered).toBe(false)
      expect(a.stage).toBeNull()
    }
    expect(seasonalAdvice('2026-11-07', 'hors_territoire').headline).toBe(
      'Territoire non couvert',
    )
  })
  it('un point incertain le signale', () => {
    expect(seasonalAdvice('2026-11-07', 'incertain').effect).toMatch(
      /appartenance au Québec n’est pas établie/,
    )
  })
})

describe('fenêtres découpées aux horaires applicables', () => {
  it('aucune fenêtre ne dépasse la plage de la règle', () => {
    const day = analyze({}, forecast('2026-11-07'))
    const range = day.planningRange
    expect(range.origin).toBe('regle')
    for (const w of day.windows) {
      const c = clipWindow(w, day, TZ)
      expect(c).not.toBeNull()
      if (!c || !range.start || !range.end) continue
      const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3))
      const clockOf = (d: Date) =>
        new Intl.DateTimeFormat('en-GB', {
          timeZone: TZ,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(d)
      expect(toMin(c.startClock)).toBeGreaterThanOrEqual(toMin(clockOf(range.start)))
      expect(toMin(c.endClock)).toBeLessThanOrEqual(toMin(clockOf(range.end)))
    }
  })
  it('une fenêtre dont un bloc dépasse la plage est marquée « découpée »', () => {
    const day = analyze({}, forecast('2026-11-07'))
    const clipped = day.windows
      .map((w) => clipWindow(w, day, TZ))
      .filter((c) => c?.clipped)
    expect(clipped.length).toBeGreaterThan(0)
  })
})

describe('composition des données : aucun avantage artificiel', () => {
  it('sans météo : activité seule, et le rapport le dit', () => {
    const day = analyze({}, null)
    const r = recommend({
      day,
      timeZone: TZ,
      territory: 'quebec',
      summary: empty,
      hasPostInfo: false,
    })
    expect(r.windows.length).toBeGreaterThan(0)
    expect(r.windows.every((w) => w.composition === 'activite_seule')).toBe(true)
    expect(r.missing.map((m) => m.id)).toContain('weather')
  })
  it('poste inconnu : le vent n’est pas évalué, donc jamais « favorable »', () => {
    const day = analyze({}, forecast('2026-11-07', { windDirectionDegrees: 0 }))
    const r = recommend({
      day,
      timeZone: TZ,
      territory: 'quebec',
      summary: empty,
      hasPostInfo: false,
    })
    expect(r.windows[0].notEvaluated).toContain('wind-direction')
    expect(r.windows[0].composition).toBe('conditions_partielles')
    expect(r.missing.find((m) => m.id === 'post')?.consequence).toMatch(/non évaluée/)
  })
  it('poste compatible ≠ poste inconnu', () => {
    const day = analyze({ favorableWindFrom: [270] }, forecast('2026-11-07'))
    const r = recommend({
      day,
      timeZone: TZ,
      territory: 'quebec',
      summary: empty,
      hasPostInfo: true,
    })
    expect(r.windows[0].evaluated).toContain('wind-direction')
    expect(r.windows[0].composition).toBe('conditions_completes')
    expect(r.missing.map((m) => m.id)).not.toContain('post')
  })
  it('compositions différentes : aucun classement entre elles', () => {
    const mk = (
      composition: ClippedWindow['composition'],
      meanIndex: number,
    ): ClippedWindow => ({
      startClock: '06:00',
      endClock: '08:00',
      minutes: 120,
      clipped: false,
      meanIndex,
      evaluated: [],
      notEvaluated: [],
      composition,
    })
    expect(
      rankWindows([mk('activite_seule', 80), mk('conditions_completes', 60)]).state,
    ).toBe('non_comparables')
  })
  it('écart minuscule : égalité, pas de vainqueur', () => {
    const mk = (m: number): ClippedWindow => ({
      startClock: '06:00',
      endClock: '08:00',
      minutes: 120,
      clipped: false,
      meanIndex: m,
      evaluated: [],
      notEvaluated: [],
      composition: 'conditions_partielles',
    })
    expect(rankWindows([mk(76.7), mk(74.8)]).state).toBe('equivalents')
    expect(rankWindows([mk(80), mk(70)]).state).toBe('departage')
  })
})

describe('robustesse', () => {
  it('fuseau non établi : aucun horaire affiché', () => {
    const day = analyze({}, forecast('2026-11-07'))
    const r = recommend({
      day,
      timeZone: null,
      territory: 'incertain',
      summary: empty,
      hasPostInfo: false,
    })
    expect(r.windows).toEqual([])
    expect(r.missing.map((m) => m.id)).toContain('timezone')
  })
  it('même entrée, même version de méthode : même résultat', () => {
    const day = analyze({}, forecast('2026-11-07'))
    const a = recommend({
      day,
      timeZone: TZ,
      territory: 'quebec',
      summary: empty,
      hasPostInfo: false,
    })
    const b = recommend({
      day,
      timeZone: TZ,
      territory: 'quebec',
      summary: empty,
      hasPostInfo: false,
    })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a.methodVersion).toBe('reperes-saisonniers-0.1')
  })
  it('observations : description seulement, jamais une preuve d’activité', () => {
    const s = { ...empty, entries: 3, hasEffort: false }
    expect(observationNote(s)).toMatch(/décrivent seulement/)
    expect(observationNote(s)).toMatch(/ne montrent pas/)
    expect(observationNote(empty)).toBeNull()
  })
})

describe('texte de recommandation et classement des jours', () => {
  it('prend position, mentionne l’égalité et la limite principale', async () => {
    const { recommendationText } = await import('./recommendationText')
    const day = analyze({}, forecast('2026-11-07'))
    const r = recommend({
      day,
      timeZone: TZ,
      territory: 'quebec',
      summary: empty,
      hasPostInfo: false,
    })
    const t = recommendationText(r)
    expect(t.headline).toMatch(/^Pour ce lieu et cette période/)
    expect(t.reasons.length).toBeGreaterThanOrEqual(2)
    expect(t.reasons.length).toBeLessThanOrEqual(3)
    expect(t.mainLimit).toMatch(/Poste et secteurs sensibles inconnus/)
  })
  it('sans météo, le texte ne prétend pas utiliser les conditions', async () => {
    const { recommendationText } = await import('./recommendationText')
    const day = analyze({}, null)
    const r = recommend({
      day,
      timeZone: TZ,
      territory: 'quebec',
      summary: empty,
      hasPostInfo: false,
    })
    const t = recommendationText(r)
    expect(t.reasons.join(' ')).toMatch(/Sans météo/)
    expect(t.mainLimit).toMatch(/Météo indisponible/)
  })
  it('hors territoire : aucun conseil de période, horaires conservés', async () => {
    const { recommendationText } = await import('./recommendationText')
    const day = analyze({}, forecast('2026-11-07'))
    const r = recommend({
      day,
      timeZone: TZ,
      territory: 'hors_territoire',
      summary: empty,
      hasPostInfo: true,
    })
    expect(r.seasonal.covered).toBe(false)
    expect(recommendationText(r).reasons[0]).toMatch(/Aucun repère saisonnier documenté/)
    expect(r.windows.length).toBeGreaterThan(0)
  })
  it('classement des jours : composition différente ou égalité, jamais un faux vainqueur', async () => {
    const { rankDays } = await import('./recommendationText')
    const w = (
      composition: ClippedWindow['composition'],
      meanIndex: number,
    ): ClippedWindow => ({
      startClock: '06:00',
      endClock: '08:00',
      minutes: 120,
      clipped: false,
      meanIndex,
      evaluated: [],
      notEvaluated: [],
      composition,
    })
    expect(
      rankDays([
        { dateKey: 'a', best: w('activite_seule', 80) },
        { dateKey: 'b', best: w('conditions_completes', 70) },
      ]).state,
    ).toBe('non_comparables')
    expect(
      rankDays([
        { dateKey: 'a', best: w('conditions_completes', 76.7) },
        { dateKey: 'b', best: w('conditions_completes', 75.2) },
      ]).state,
    ).toBe('equivalents')
    expect(
      rankDays([
        { dateKey: 'a', best: w('conditions_completes', 80) },
        { dateKey: 'b', best: w('conditions_completes', 60) },
      ]).order,
    ).toEqual(['a', 'b'])
    expect(rankDays([{ dateKey: 'a', best: w('conditions_completes', 80) }]).state).toBe(
      'insuffisant',
    )
  })
})
