import { describe, expect, it } from 'vitest'
import {
  NOW,
  NOW_KEY,
  TZ,
  makeWeather,
  makeWindField,
} from '@/features/analytics/testFixtures'
import {
  buildHourOptions,
  hourKeyOf,
  resolveHour,
  weatherForHour,
  windReadingForHour,
  zonedHourToDate,
} from './analysisTime'
import { localHourKey } from './windField'

describe('zonedHourToDate', () => {
  it('convertit une heure locale d’été (EDT, UTC−4) vers le bon instant', () => {
    expect(zonedHourToDate('2026-08-17T10:00', TZ).toISOString()).toBe(
      '2026-08-17T14:00:00.000Z',
    )
  })

  it('tient compte de l’heure d’hiver (EST, UTC−5)', () => {
    expect(zonedHourToDate('2026-12-17T10:00', TZ).toISOString()).toBe(
      '2026-12-17T15:00:00.000Z',
    )
  })

  it('reste correct le jour du changement d’heure (8 mars 2026, 03:00 EDT)', () => {
    expect(zonedHourToDate('2026-03-08T12:00', TZ).toISOString()).toBe(
      '2026-03-08T16:00:00.000Z',
    )
  })
})

describe('resolveHour : actuel, prévision, heure passée', () => {
  it('sans heure demandée = l’heure en cours, étiquetée « actuel »', () => {
    const hour = resolveHour(null, NOW, TZ)
    expect(hour.hourKey).toBe(NOW_KEY)
    expect(hour.kind).toBe('current')
    expect(hour.timeLabel).toBe('actuel')
    expect(hour.instant).toBe(NOW)
  })

  it('une heure future est une « prévision pour HH:mm », jamais « actuel »', () => {
    const hour = resolveHour('2026-08-17T18:00', NOW, TZ)
    expect(hour.kind).toBe('forecast')
    expect(hour.timeLabel).toBe('prévision pour 18:00')
    expect(hour.instant.toISOString()).toBe('2026-08-17T22:00:00.000Z')
  })

  it('une heure de demain le dit', () => {
    const hour = resolveHour('2026-08-18T06:00', NOW, TZ)
    expect(hour.timeLabel).toBe('prévision pour demain 06:00')
  })

  it('une heure déjà écoulée est une valeur de modèle, pas une observation', () => {
    const hour = resolveHour('2026-08-17T09:00', NOW, TZ)
    expect(hour.kind).toBe('past')
    expect(hour.timeLabel).toBe('heure passée 09:00 (valeur de modèle)')
  })
})

describe('buildHourOptions : seulement ce qui est réellement chargé', () => {
  it('liste les heures présentes dans la météo et le vent (48 h) et rien d’autre', () => {
    const weather = makeWeather()
    const wind = makeWindField([{ lat: 46.8, lng: -71.2 }])
    const options = buildHourOptions(wind, weather, NOW)
    expect(options).toHaveLength(48)
    expect(options.find((o) => o.hourKey === NOW_KEY)?.kind).toBe('current')
    expect(options.find((o) => o.hourKey === '2026-08-19T00:00')).toBeUndefined()
  })

  it('n’extrapole pas : sans données chargées il ne reste que l’heure en cours', () => {
    const options = buildHourOptions(null, null, NOW)
    // Sans données, l'heure courante suit le fuseau de l'appareil (pas celui des données).
    const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    expect(options.map((o) => o.hourKey)).toEqual([localHourKey(NOW, deviceZone)])
    expect(options[0].hasWind).toBe(false)
    expect(options[0].hasWeather).toBe(false)
  })

  it('signale une heure couverte par une seule source', () => {
    const weather = makeWeather()
    weather.hourly = weather.hourly.filter((h) => h.time < '2026-08-18T00:00')
    const wind = makeWindField([{ lat: 46.8, lng: -71.2 }])
    const tomorrow = buildHourOptions(wind, weather, NOW).find(
      (o) => o.hourKey === '2026-08-18T06:00',
    )
    expect(tomorrow?.hasWind).toBe(true)
    expect(tomorrow?.hasWeather).toBe(false)
  })
})

describe('weatherForHour', () => {
  const weather = makeWeather((time) =>
    time === '2026-08-17T18:00' ? { precipitationMm: 6 } : {},
  )

  it('utilise le relevé « actuel » pour l’heure en cours', () => {
    const result = weatherForHour(weather, resolveHour(null, NOW, TZ))
    expect(result.conditions?.temperatureCelsius).toBe(21)
    expect(result.dataTime).toBe('2026-08-17T14:15')
  })

  it('utilise l’entrée horaire de l’heure choisie, pas le relevé actuel', () => {
    const result = weatherForHour(weather, resolveHour('2026-08-17T18:00', NOW, TZ))
    expect(result.conditions?.precipitationMm).toBe(6)
    expect(result.conditions?.temperatureCelsius).toBe(18)
  })

  it('une heure absente des données est indisponible, jamais extrapolée', () => {
    const result = weatherForHour(weather, resolveHour('2026-08-19T06:00', NOW, TZ))
    expect(result.conditions).toBeNull()
    expect(result.reason).toMatch(/pas dans les données météo/)
  })
})

describe('windReadingForHour', () => {
  it('lit l’heure choisie dans la série, pas l’index 0 (minuit)', () => {
    const field = makeWindField([{ lat: 46.8, lng: -71.2 }], (time) =>
      time === '2026-08-17T18:00' ? { speedKmh: 33 } : { speedKmh: 4 },
    )
    const hourly = field.samples[0].hourly
    expect(
      windReadingForHour(hourly, resolveHour('2026-08-17T18:00', NOW, TZ))?.speedKmh,
    ).toBe(33)
    expect(windReadingForHour(hourly, resolveHour(null, NOW, TZ))?.speedKmh).toBe(4)
    expect(
      windReadingForHour(hourly, resolveHour('2026-08-20T00:00', NOW, TZ)),
    ).toBeNull()
  })
})

describe('hourKeyOf', () => {
  it('ramène un horodatage de 15 minutes à son heure', () => {
    expect(hourKeyOf('2026-08-17T14:15')).toBe('2026-08-17T14:00')
  })
})
