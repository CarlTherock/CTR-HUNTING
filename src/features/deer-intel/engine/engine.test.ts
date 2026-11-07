import { describe, expect, it } from 'vitest'
import type { PointForecast, PointHourly } from '@/types'
import { addDays, utcFromZoned, zonedClock } from '@/features/hunting-hours/zonedTime'
import { referenceActivity } from './activity'
import { angularDifference, flowDegrees } from './circular'
import { evaluateConditions } from './conditions'
import { analyzeHunt, DEFAULT_PARAMS, type HuntParams, type HourSlot } from './index'
import { moonDay, moonIsUp } from './moon'
import { solarDay } from './sunDay'
import { solunarDelta, SOLUNAR_MAX_DELTA } from './solunar'
import { hourWeather, indexForecast } from './weatherContext'
import { assessRobustness } from './windows'

function nn<T>(v: T | null | undefined): T {
  if (v === null || v === undefined) throw new Error('valeur attendue')
  return v
}

const TZ = 'America/Toronto'
const MTL = { lat: 45.5, lng: -73.57 }
const ACTON = { lat: 45.65, lng: -72.57 }

const clockMin = (d: Date | null) => {
  if (!d) return NaN
  const [h, m] = zonedClock(d, TZ).split(':').map(Number)
  return h * 60 + m
}

function params(over: Partial<HuntParams> = {}): HuntParams {
  return {
    ...DEFAULT_PARAMS,
    coordinate: ACTON,
    timezone: TZ,
    startDateKey: '2026-11-06',
    days: 1,
    ...over,
  }
}

function hourly(
  dateKey: string,
  hour: number,
  over: Partial<PointHourly> = {},
): PointHourly {
  return {
    time: `${dateKey}T${String(hour).padStart(2, '0')}:00`,
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

function dayForecast(
  dateKey: string,
  over: (h: number) => Partial<PointHourly> = () => ({}),
): PointForecast {
  return {
    timezone: TZ,
    hourly: Array.from({ length: 24 }, (_, h) => hourly(dateKey, h, over(h))),
    daily: [],
  }
}

describe('directions circulaires', () => {
  it('359° → 1° vaut 2°, pas 358°', () => {
    expect(angularDifference(359, 1)).toBe(2)
    expect(angularDifference(1, 359)).toBe(2)
    expect(angularDifference(0, 180)).toBe(180)
    expect(flowDegrees(180)).toBe(0)
  })
})

describe('soleil local', () => {
  it('lever et coucher plausibles à Montréal début novembre, dans le fuseau du lieu', () => {
    const s = solarDay(MTL, '2026-11-06', TZ)
    expect(clockMin(s.sunrise)).toBeGreaterThan(6 * 60 + 15)
    expect(clockMin(s.sunrise)).toBeLessThan(7 * 60 + 15)
    expect(clockMin(s.sunset)).toBeGreaterThan(16 * 60 + 20)
    expect(clockMin(s.sunset)).toBeLessThan(17 * 60 + 20)
    expect(nn(s.dawn).getTime()).toBeLessThan(nn(s.sunrise).getTime())
    expect(nn(s.dusk).getTime()).toBeGreaterThan(nn(s.sunset).getTime())
  })

  it('le pic du matin suit le lever local : il se déplace avec la date, pas fixé à 6 h', () => {
    const jul = solarDay(ACTON, '2026-06-21', TZ)
    const nov = solarDay(ACTON, '2026-11-06', TZ)
    expect(clockMin(jul.sunrise)).toBeLessThan(clockMin(nov.sunrise) - 60)
    const peak = (sun: typeof jul) => {
      let best = { t: 0, v: -1 }
      for (
        let t = nn(sun.sunrise).getTime() - 3_600_000;
        t < nn(sun.sunrise).getTime() + 3 * 3_600_000;
        t += 300_000
      ) {
        const v = nn(referenceActivity(new Date(t), sun))
        if (v > best.v) best = { t, v }
      }
      return best.t - nn(sun.sunrise).getTime()
    }
    // Le pic tombe peu après le lever, quelle que soit la saison.
    expect(Math.abs(peak(jul) - peak(nov))).toBeLessThan(15 * 60_000)
    expect(peak(nov)).toBeGreaterThan(0)
  })

  it('jour polaire : pas de lever, pas d’activité inventée', () => {
    const s = solarDay({ lat: 78, lng: 15 }, '2026-06-21', 'Europe/Oslo')
    expect(s.sunrise).toBeNull()
    expect(referenceActivity(new Date('2026-06-21T12:00:00Z'), s)).toBeNull()
  })
})

describe('activité de référence', () => {
  const sun = solarDay(ACTON, '2026-11-06', TZ)
  it('crépusculaire, avec un plancher non nul la nuit et le jour', () => {
    const at = (min: number) =>
      nn(referenceActivity(new Date(nn(sun.sunrise).getTime() + min * 60_000), sun))
    const noon = nn(
      referenceActivity(new Date(utcFromZoned('2026-11-06', 12, 0, TZ)), sun),
    )
    const night = nn(
      referenceActivity(new Date(utcFromZoned('2026-11-06', 1, 0, TZ)), sun),
    )
    expect(at(20)).toBeGreaterThan(noon + 30)
    expect(noon).toBeGreaterThan(0)
    expect(night).toBeGreaterThan(0)
    expect(night).toBeLessThan(at(20))
  })
})

describe('lune', () => {
  it('lever, coucher et passages calculés dans le jour local ; passage inférieur ≠ supérieur + 12 h', () => {
    const uppers: number[] = []
    let notExactlyTwelve = 0
    let withBoth = 0
    for (let i = 0; i < 20; i++) {
      const key = addDays('2026-11-01', i)
      const m = moonDay(ACTON, key, TZ)
      if (m.upperTransit) uppers.push(m.upperTransit.getTime())
      if (m.upperTransit && m.lowerTransit) {
        withBoth++
        const delta =
          Math.abs(m.lowerTransit.getTime() - m.upperTransit.getTime()) / 3_600_000
        if (Math.abs(delta - 12) > 0.05) notExactlyTwelve++
      }
    }
    expect(uppers.length).toBeGreaterThanOrEqual(18)
    for (let i = 1; i < uppers.length; i++) {
      const gapH = (uppers[i] - uppers[i - 1]) / 3_600_000
      if (gapH < 30) expect(gapH).toBeGreaterThan(23.5)
    }
    expect(withBoth).toBeGreaterThan(5)
    expect(notExactlyTwelve).toBeGreaterThan(0)
  })

  it('un événement absent un jour donné reste null (jour lunaire ≈ 24 h 50)', () => {
    const days = Array.from({ length: 30 }, (_, i) =>
      moonDay(ACTON, addDays('2026-11-01', i), TZ),
    )
    expect(days.some((d) => d.rise === null || d.set === null)).toBe(true)
    for (const d of days) {
      if (d.rise && d.set) {
        expect(d.rise.getTime()).not.toBe(d.set.getTime())
      }
    }
  })

  it('la fraction éclairée n’est pas la présence de la lune : forte fraction sous l’horizon possible', () => {
    let found = false
    for (let i = 0; i < 30 && !found; i++) {
      const key = addDays('2026-11-01', i)
      const m = moonDay(ACTON, key, TZ)
      if (m.illuminationFraction > 0.9) {
        for (let h = 0; h < 24; h++) {
          if (!moonIsUp(utcFromZoned(key, h, 0, TZ), ACTON)) found = true
        }
      }
    }
    expect(found).toBe(true)
  })
})

describe('contexte météo', () => {
  it('pas de tendance de pression si une des deux valeurs manque ; pas de « depuis hier » le premier jour', () => {
    const f: PointForecast = {
      timezone: TZ,
      hourly: [
        hourly('2026-11-06', 9, { surfacePressureHpa: 1000 }),
        hourly('2026-11-06', 10, { surfacePressureHpa: null }),
        hourly('2026-11-06', 11, { surfacePressureHpa: 998 }),
        hourly('2026-11-06', 12, { surfacePressureHpa: 996 }),
        hourly('2026-11-06', 13, { surfacePressureHpa: 994 }),
      ],
      daily: [],
    }
    const idx = indexForecast(f)
    expect(hourWeather(idx, '2026-11-06T12:00')?.pressureChange3hHpa).toBe(-4) // 996 − 1000, 9 h présent
    expect(hourWeather(idx, '2026-11-06T11:00')?.pressureChange3hHpa).toBeNull() // 8 h absent
    expect(hourWeather(idx, '2026-11-06T13:00')?.pressureChange3hHpa).toBeNull() // 10 h sans pression
    expect(
      hourWeather(idx, '2026-11-06T12:00')?.temperatureChangeSinceYesterdayC,
    ).toBeNull()
    expect(hourWeather(idx, '2026-11-09T12:00')).toBeNull()
  })

  it('la variation depuis hier exige la même heure de la veille', () => {
    const f: PointForecast = {
      timezone: TZ,
      hourly: [
        hourly('2026-11-06', 12, { temperatureCelsius: 8 }),
        hourly('2026-11-07', 12, { temperatureCelsius: 3 }),
      ],
      daily: [],
    }
    expect(
      hourWeather(indexForecast(f), '2026-11-07T12:00')?.temperatureChangeSinceYesterdayC,
    ).toBe(-5)
  })
})

describe('conditions de chasse', () => {
  const w = (over: Partial<NonNullable<ReturnType<typeof hourWeather>>> = {}) => ({
    temperatureC: 2,
    temperatureChangeSinceYesterdayC: null,
    surfacePressureHpa: 1000,
    pressureChange3hHpa: null,
    precipitationMm: 0,
    windSpeedKmh: 15,
    windGustsKmh: 20,
    windFromDegrees: 270,
    cloudCoverPercent: 0,
    snowDepthM: null,
    snowfallCm: null,
    ...over,
  })

  it('sans poste ni zone renseignés, le vent n’est pas évalué (ni 0 ni 50)', () => {
    const r = evaluateConditions({
      weather: w(),
      favorableWindFrom: [],
      sensitiveBearings: [],
    })
    expect(r.factors.find((f) => f.id === 'wind-direction')?.score).toBeNull()
    expect(r.signature).not.toContain('wind-direction')
  })

  it('359° et 1° : un vent de 359° est compatible avec un poste favorable à 1°', () => {
    const r = evaluateConditions({
      weather: w({ windFromDegrees: 359 }),
      favorableWindFrom: [1],
      sensitiveBearings: [],
    })
    expect(r.factors.find((f) => f.id === 'wind-direction')?.score).toBe(100)
  })

  it('signale le transport d’odeur vers une zone sensible et la faiblesse de la direction par vent très faible', () => {
    // vent du sud (180°) → flux vers le nord ; zone sensible au nord
    const r = evaluateConditions({
      weather: w({ windFromDegrees: 180, windSpeedKmh: 2 }),
      favorableWindFrom: [],
      sensitiveBearings: [0],
    })
    const f = nn(r.factors.find((x) => x.id === 'wind-direction'))
    expect(f.score).toBe(0)
    expect(f.note).toMatch(/porte l'odeur vers la zone sensible/)
    expect(f.note).toMatch(/peu fiable/)
  })

  it('sans météo, aucun facteur n’est noté : conditions null', () => {
    const r = evaluateConditions({
      weather: null,
      favorableWindFrom: [1],
      sensitiveBearings: [],
    })
    expect(r.score).toBeNull()
  })
})

describe('moteur « quand »', () => {
  const now = new Date('2026-11-06T15:00:00Z')

  it('la pression (valeur ou variation) ne change aucun indice : aucun bonus biologique', () => {
    const calm = dayForecast('2026-11-06', () => ({ surfacePressureHpa: 1013 }))
    const storm = dayForecast('2026-11-06', (h) => ({
      surfacePressureHpa: 1030 - h * 1.5,
    }))
    const none = dayForecast('2026-11-06', () => ({ surfacePressureHpa: null }))
    const idx = (f: PointForecast) =>
      analyzeHunt(params(), f, { now }).days[0]?.slots.map((s) => s.index)
    expect(idx(storm)).toEqual(idx(calm))
    expect(idx(none)).toEqual(idx(calm))
  })

  it('fonctionne sans prévision, sans journal et sans observations : activité de référence seulement', () => {
    const a = analyzeHunt(params(), null, { now })
    expect(a.forecast).toBeNull()
    const d = a.days[0]
    expect(d.weatherCoverage).toBe('aucune')
    const candidates = d.slots.filter((s) => s.candidate)
    expect(candidates.length).toBeGreaterThan(8)
    for (const s of candidates) {
      expect(s.conditions).toBeNull()
      expect(s.index).toBe(s.activity)
      expect(s.signature).toBe('activite')
    }
    expect(d.windows.length).toBeGreaterThan(0)
  })

  it('est déterministe et ne dépend pas de la date d’exécution pour le calcul', () => {
    const a = analyzeHunt(params(), null, { now })
    const b = analyzeHunt(params(), null, { now: new Date('2026-11-10T00:00:00Z') })
    expect(b.days[0].slots.map((s) => s.index)).toEqual(
      a.days[0].slots.map((s) => s.index),
    )
  })

  it('les coordonnées choisies sont utilisées : un autre lieu donne un autre soleil', () => {
    const east = analyzeHunt(params({ coordinate: { lat: 47, lng: -65 } }), null, { now })
    const west = analyzeHunt(params({ coordinate: { lat: 46, lng: -78 } }), null, { now })
    expect(nn(east.days[0].sun.sunrise).getTime()).not.toBe(
      nn(west.days[0].sun.sunrise).getTime(),
    )
  })

  it('heure d’été : 23 heures au printemps, 25 à l’automne, et pas de glissement de date', () => {
    const spring = analyzeHunt(params({ startDateKey: '2026-03-08' }), null, { now })
    const fall = analyzeHunt(params({ startDateKey: '2026-11-01' }), null, { now })
    expect(spring.days[0].slots).toHaveLength(23)
    expect(fall.days[0].slots).toHaveLength(25)
    expect(new Set(spring.days[0].slots.map((s) => s.dateKey))).toEqual(
      new Set(['2026-03-08']),
    )
  })

  it('minuit : les créneaux de deux jours consécutifs restent dans leur date locale', () => {
    const a = analyzeHunt(params({ days: 2 }), null, { now })
    expect(a.days.map((d) => d.dateKey)).toEqual(['2026-11-06', '2026-11-07'])
    expect(a.days[1].slots[0].localKey).toBe('2026-11-07T00:00')
  })

  it('la météo manquante au-delà de l’horizon n’est pas inventée', () => {
    const f = dayForecast('2026-11-06')
    const a = analyzeHunt(params({ days: 2 }), f, {
      now,
      fetchedAt: '2026-11-06T14:00:00Z',
    })
    expect(a.days[0].weatherCoverage).toBe('complete')
    expect(a.days[1].weatherCoverage).toBe('aucune')
    for (const s of a.days[1].slots) {
      expect(s.weather).toBeNull()
      expect(s.conditions).toBeNull()
    }
  })

  it('rafales et pluie abaissent l’indice sans toucher à l’activité de référence', () => {
    const calm = analyzeHunt(params(), dayForecast('2026-11-06'), { now }).days[0]
    const stormy = analyzeHunt(
      params(),
      dayForecast('2026-11-06', () => ({ windGustsKmh: 70, precipitationMm: 3 })),
      { now },
    ).days[0]
    const pick = (d: typeof calm) => nn(d.slots.find((s) => s.candidate))
    expect(pick(stormy).activity).toBe(pick(calm).activity)
    expect(nn(pick(stormy).index)).toBeLessThan(nn(pick(calm).index))
  })

  it('la disponibilité de l’utilisateur restreint les heures admissibles', () => {
    const a = analyzeHunt(
      params({ availability: { startMinutes: 15 * 60, endMinutes: 18 * 60 } }),
      null,
      { now },
    )
    const hours = a.days[0].slots.filter((s) => s.candidate).map((s) => s.clock)
    expect(hours.every((c) => c >= '15:00' && c < '18:00')).toBe(true)
  })

  it('une règle hors de son territoire ne produit aucune plage et le dit', () => {
    const a = analyzeHunt(
      params({
        coordinate: { lat: 48.85, lng: 2.35 },
        timezone: 'Europe/Paris',
        huntingRuleId: 'quebec-general',
      }),
      null,
      { now },
    )
    expect(a.days[0].planningRange.origin).toBe('indisponible')
    expect(a.days[0].slots.some((s) => s.candidate)).toBe(false)
    expect(a.days[0].windows).toEqual([])
  })

  it('l’hypothèse solunaire est désactivée par défaut, bornée, et comparée avec/sans', () => {
    const off = analyzeHunt(params(), null, { now })
    const on = analyzeHunt(params({ experimentalSolunar: true }), null, { now })
    expect(off.days[0].slots.map((s) => s.index)).toEqual(
      off.days[0].slots.map((s) => s.activity),
    )
    for (const s of on.days[0].slots) {
      if (s.activity !== null && s.activityWithHypothesis !== null) {
        expect(Math.abs(s.activityWithHypothesis - s.activity)).toBeLessThanOrEqual(
          SOLUNAR_MAX_DELTA + 1e-9,
        )
      }
    }
    expect(off.variants.map((v) => v.id)).toEqual([
      'reference',
      'avec_hypothese_solunaire',
      'activite_seule',
    ])
    expect(off.days[0].slots.map((s) => s.activityWithHypothesis)).toEqual(
      on.days[0].slots.map((s) => s.activityWithHypothesis),
    )
  })

  it('pas de double comptage lunaire/solaire : la lune seule ne change que l’hypothèse opt-in', () => {
    const moon = moonDay(ACTON, '2026-11-06', TZ)
    const mid = new Date(utcFromZoned('2026-11-06', 3, 0, TZ))
    expect(Math.abs(solunarDelta(mid, moon))).toBeLessThanOrEqual(SOLUNAR_MAX_DELTA)
    const off = analyzeHunt(params(), null, { now }).days[0]
    expect(off.slots.every((s) => s.index === s.activity)).toBe(true)
  })
})

describe('robustesse du classement', () => {
  const mk = (
    clockH: number,
    activity: number,
    conditions: number | null = null,
  ): HourSlot => ({
    startIso: `2026-11-06T${String(clockH).padStart(2, '0')}:00:00.000Z`,
    endIso: `2026-11-06T${String(clockH + 1).padStart(2, '0')}:00:00.000Z`,
    dateKey: '2026-11-06',
    clock: `${String(clockH).padStart(2, '0')}:00`,
    localKey: `2026-11-06T${String(clockH).padStart(2, '0')}:00`,
    sunUp: true,
    moonUp: false,
    activity,
    activityWithHypothesis: activity,
    conditions,
    factors: [],
    index: null,
    signature: conditions === null ? 'activite' : 'activite+gusts',
    candidate: true,
    weather: null,
    pressure4h: null,
  })

  it('heures presque identiques : équivalentes, pas de faux vainqueur', () => {
    const slots = [6, 7, 8, 9, 10].map((h) => mk(h, 60 + (h % 2)))
    expect(assessRobustness(slots).robustness).toBe('equivalent')
  })

  it('un classement qui bascule avec les poids est dit fragile', () => {
    // fenêtre A : forte activité, mauvaises conditions ; fenêtre B : activité moyenne, très bonnes conditions
    const slots = [
      mk(6, 90, 20),
      mk(7, 90, 20),
      mk(8, 40, 40),
      mk(9, 40, 40),
      mk(10, 40, 40),
      mk(11, 40, 40),
      mk(12, 62, 100),
      mk(13, 62, 100),
    ]
    expect(assessRobustness(slots).robustness).toBe('fragile')
  })

  it('un seul créneau net est stable ou unique', () => {
    const slots = [mk(6, 30), mk(7, 85), mk(8, 88), mk(9, 30), mk(10, 25)]
    expect(['stable', 'unique']).toContain(assessRobustness(slots).robustness)
  })

  it('rien d’admissible : insuffisant', () => {
    const s = mk(6, 80)
    s.candidate = false
    expect(assessRobustness([s]).robustness).toBe('insufficient')
  })
})
