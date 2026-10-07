import { describe, expect, it } from 'vitest'
import {
  NOW,
  NOW_KEY,
  makeWindField,
  makeWeather,
} from '@/features/analytics/testFixtures'
import type { GeolocationReading } from '@/features/gps/useGeolocation'
import { vegetationAnalyzer, weatherAnalyzer, windAnalyzer } from '@/utils/analyzers'
import type {
  Coordinate,
  Observation,
  Track,
  VegetationSample,
  Waypoint,
  WindHourlyReading,
} from '@/types'
import { compareCaches, rankRows } from './compareCaches'
import {
  CRITERION_ORDER,
  HABITAT_NEUTRAL_INDEX,
  HEAVY_PRECIPITATION_MM,
  WIND_CALM_KMH,
  WIND_STRONG_KMH,
} from './criteria'
import type {
  CompareCachesInput,
  CompareRecords,
  CriterionId,
  SourceState,
} from './types'

const A: Coordinate = { lat: 46.8, lng: -71.2 }
const B: Coordinate = { lat: 46.82, lng: -71.25 }
const C: Coordinate = { lat: 46.84, lng: -71.3 }
const D: Coordinate = { lat: 46.86, lng: -71.35 }

function wp(id: string, coordinate: Coordinate, extra: Partial<Waypoint> = {}): Waypoint {
  return {
    id,
    name: `Cache ${id}`,
    coordinate,
    category: 'stand_blind',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...extra,
  }
}

const OK_WIND: SourceState = { status: 'ok', fetchedAt: '2026-08-17T18:10:00.000Z' }
const OK_VEG: SourceState = { status: 'ok', fetchedAt: '2026-08-17T18:11:00.000Z' }

function vegetation(
  coordinate: Coordinate,
  counts: VegetationSample['categoryCounts'],
): VegetationSample {
  return {
    coordinate,
    radiusMeters: 300,
    categoryCounts: counts,
    source: 'openstreetmap',
  }
}

function records(
  waypoints: Waypoint[],
  extra: Partial<CompareRecords> = {},
): CompareRecords {
  return {
    waypoints,
    tracks: [],
    observations: [],
    readAt: '2026-08-17T18:12:00.000Z',
    ...extra,
  }
}

function input(
  waypoints: Waypoint[],
  overrides: Partial<CompareCachesInput> = {},
): CompareCachesInput {
  return {
    waypoints,
    hourKey: null,
    now: NOW,
    windField: makeWindField(waypoints.map((w) => w.coordinate)),
    wind: OK_WIND,
    vegetation: waypoints.map((w) => vegetation(w.coordinate, { forest: 2, water: 1 })),
    vegetationState: OK_VEG,
    records: records(waypoints),
    gps: null,
    nowMs: NOW.getTime(),
    ...overrides,
  }
}

function status(
  result: ReturnType<typeof compareCaches>,
  id: string,
  criterion: (typeof CRITERION_ORDER)[number],
) {
  const row = result.rows.find((r) => r.waypointId === id)
  return row?.criteria.find((c) => c.id === criterion)?.status
}

describe('compareCaches — missing data is never replaced by a neutral value', () => {
  it('marks wind/weather criteria "non évaluable" when no wind is loaded (no zero, no neutral)', () => {
    const waypoints = [wp('a', A), wp('b', B)]
    const result = compareCaches(
      input(waypoints, {
        windField: null,
        wind: { status: 'error', reason: 'hors ligne' },
      }),
    )
    for (const row of result.rows) {
      expect(row.wind.status).toBe('unavailable')
      expect(row.conditions.status).toBe('unavailable')
      expect(row.criteria.find((c) => c.id === 'wind-speed')?.status).toBe(
        'not-evaluable',
      )
      expect(row.criteria.find((c) => c.id === 'precipitation')?.status).toBe(
        'not-evaluable',
      )
      expect(row.missingData.join(' ')).toContain('hors ligne')
    }
  })

  it('reports coverage per waypoint and lists the criteria that cannot be evaluated', () => {
    const a = wp('a', A, { optimalWindDirections: [270] })
    const b = wp('b', B)
    const result = compareCaches(input([a, b]))
    const rowA = result.rows[0]
    const rowB = result.rows[1]
    // a : direction, vitesse, précipitations, habitat évaluables ; pas de signe.
    expect(rowA.coverage).toMatchObject({
      evaluable: 4,
      total: 5,
      text: '4/5 critères évaluables',
    })
    expect(rowA.coverage.missing).toEqual(['game-signs'])
    // b : pas de direction préférée non plus.
    expect(rowB.coverage.text).toBe('3/5 critères évaluables')
    expect(rowB.coverage.missing).toEqual(['wind-direction', 'game-signs'])
  })

  it('never turns a missing preference or missing sign into "met" or "not met"', () => {
    const result = compareCaches(input([wp('a', A), wp('b', B)]))
    expect(status(result, 'a', 'wind-direction')).toBe('not-evaluable')
    expect(status(result, 'a', 'game-signs')).toBe('not-evaluable')
  })

  it('reports habitat as "non renseigné" when nothing is mapped, and keeps the reason', () => {
    const a = wp('a', A)
    const result = compareCaches(
      input([a, wp('b', B)], { vegetation: [vegetation(A, {}), vegetation(B, {})] }),
    )
    expect(result.rows[0].habitat.state).toBe('not-informed')
    expect(result.rows[0].habitat.summary).toContain('non renseigné')
    expect(status(result, 'a', 'habitat')).toBe('not-evaluable')
  })

  it('explains an unavailable vegetation source (skipped, error)', () => {
    const skipped = compareCaches(
      input([wp('a', A), wp('b', B)], {
        vegetation: null,
        vegetationState: { status: 'skipped', reason: 'emprise trop étendue' },
      }),
    )
    expect(skipped.rows[0].habitat.state).toBe('not-informed')
    expect(skipped.rows[0].habitat.vegetation.unavailableReason).toContain(
      'emprise trop étendue',
    )
    const failed = compareCaches(
      input([wp('a', A), wp('b', B)], {
        vegetation: null,
        vegetationState: { status: 'error', reason: 'Overpass occupé' },
      }),
    )
    expect(failed.rows[0].missingData.join(' ')).toContain('Overpass occupé')
  })

  it('terrain is never evaluated from this page and says so', () => {
    const result = compareCaches(input([wp('a', A), wp('b', B)]))
    expect(result.rows[0].habitat.terrain.score).toBeNull()
    expect(result.rows[0].habitat.terrain.unavailableReason).toContain(
      'Terrain non évalué',
    )
  })
})

describe('compareCaches — wind compatibility', () => {
  it('is compatible when the wind comes from a preferred octant, otherwise not', () => {
    const a = wp('a', A, { optimalWindDirections: [270] })
    const b = wp('b', B, { optimalWindDirections: [90] })
    const result = compareCaches(input([a, b]))
    expect(result.rows[0].windPreference.compatible).toBe(true)
    expect(status(result, 'a', 'wind-direction')).toBe('met')
    expect(result.rows[1].windPreference.compatible).toBe(false)
    expect(status(result, 'b', 'wind-direction')).toBe('not-met')
  })

  it('snaps the wind to the nearest octant like the rest of the app (262° counts as west)', () => {
    const a = wp('a', A, { optimalWindDirections: [270] })
    const field = makeWindField([A, B], () => ({ directionDegrees: 262 }))
    const result = compareCaches(input([a, wp('b', B)], { windField: field }))
    expect(result.rows[0].windPreference.compatible).toBe(true)
  })

  it('has no verdict without a saved preference', () => {
    const result = compareCaches(input([wp('a', A), wp('b', B)]))
    expect(result.rows[0].windPreference.compatible).toBeNull()
    expect(result.rows[0].windPreference.note).toContain('Aucune direction')
  })

  it('shows wind and gusts with source, hour and the distance to the model grid point', () => {
    const field = makeWindField([{ lat: 46.805, lng: -71.2 }, B])
    const result = compareCaches(input([wp('a', A), wp('b', B)], { windField: field }))
    const wind = result.rows[0].wind
    expect(wind.status).toBe('available')
    if (wind.status !== 'available') return
    expect(wind.reading.speedKmh).toBe(12)
    expect(wind.reading.gustsKmh).toBe(20)
    expect(wind.source).toContain('Open-Meteo')
    expect(wind.dataTime).toBe(NOW_KEY)
    expect(wind.sampleDistanceMeters).toBeGreaterThan(400)
    expect(wind.sampleDistanceMeters).toBeLessThan(700)
  })
})

describe('compareCaches — the chosen hour', () => {
  it('distinguishes current, forecast and past hours and never extrapolates', () => {
    const waypoints = [wp('a', A), wp('b', B)]
    const current = compareCaches(input(waypoints))
    expect(current.hour.kind).toBe('current')
    const cond = current.rows[0].conditions
    expect(cond.status === 'available' && cond.timeKind).toBe('current')
    expect(cond.status === 'available' && cond.timeLabel).toContain('Actuel')

    const future = compareCaches(input(waypoints, { hourKey: '2026-08-17T18:00' }))
    expect(future.hour.kind).toBe('forecast')
    const fc = future.rows[0].conditions
    expect(fc.status === 'available' && fc.timeKind).toBe('forecast')
    expect(fc.status === 'available' && fc.timeLabel).toContain('prévision pour 18:00')

    const past = compareCaches(input(waypoints, { hourKey: '2026-08-17T08:00' }))
    expect(past.hour.kind).toBe('past')

    const outside = compareCaches(input(waypoints, { hourKey: '2026-08-25T08:00' }))
    expect(outside.rows[0].wind.status).toBe('unavailable')
    expect(
      outside.rows[0].wind.status === 'unavailable' && outside.rows[0].wind.reason,
    ).toContain('aucune extrapolation')
  })

  it('uses the reading of the chosen hour', () => {
    const field = makeWindField([A, B], (hourKey) =>
      hourKey === '2026-08-17T18:00' ? { speedKmh: 40, directionDegrees: 90 } : {},
    )
    const waypoints = [wp('a', A, { optimalWindDirections: [90] }), wp('b', B)]
    const result = compareCaches(
      input(waypoints, { windField: field, hourKey: '2026-08-17T18:00' }),
    )
    expect(status(result, 'a', 'wind-speed')).toBe('not-met')
    expect(status(result, 'a', 'wind-direction')).toBe('met')
    expect(
      result.rows[0].wind.status === 'available' && result.rows[0].wind.timeLabel,
    ).toContain('18:00')
  })
})

describe('compareCaches — ranking by documented criteria', () => {
  it('orders by the number of met criteria among the common ones, with reasons', () => {
    const field = makeWindField([A, B, C], (_hour, index) =>
      index === 2 ? { speedKmh: 3, precipitationMm: 6 } : {},
    )
    const a = wp('a', A, { optimalWindDirections: [270] })
    const b = wp('b', B, { optimalWindDirections: [90] })
    const c = wp('c', C, { optimalWindDirections: [270] })
    const result = compareCaches(input([c, b, a], { windField: field }))
    const { ranking } = result
    expect(ranking.status).toBe('ranked')
    expect(ranking.entries.map((e) => [e.waypointId, e.rank, e.metCount])).toEqual([
      ['a', 1, 4],
      ['b', 2, 3],
      ['c', 3, 2],
    ])
    expect(ranking.commonCriteria).toEqual([
      'wind-direction',
      'wind-speed',
      'precipitation',
      'habitat',
    ])
    const entryA = ranking.entries[0]
    expect(entryA.reasons[0]).toContain(
      '4 critère(s) satisfait(s) sur 4 critères communs',
    )
    expect(ranking.entries[1].reasons.join(' ')).toContain(
      'Seul point où « Vent dans une direction préférée » n’est pas satisfait',
    )
    expect(ranking.summary).toContain('Tri par nombre de critères satisfaits')
    // Ne départage pas : l'habitat est identique partout.
    expect(ranking.differentiating).not.toContain('habitat')
    expect(ranking.summary).toContain('Ne départagent pas')
  })

  it('does not advantage or penalise a waypoint for a criterion the others lack', () => {
    // a a un signe de gibier (5 critères évaluables), b n'en a pas (4).
    const a = wp('a', A, { optimalWindDirections: [270] })
    const b = wp('b', B, { optimalWindDirections: [270] })
    const sign = wp('sign', { lat: 46.8005, lng: -71.2 }, { category: 'game_sign' })
    const all = [a, b, sign]
    const result = compareCaches(input([a, b], { records: records(all) }))
    expect(result.rows[0].coverage.evaluable).toBe(5)
    expect(result.rows[1].coverage.evaluable).toBe(4)
    // Le critère « signe de gibier » n'est pas commun : hors du tri.
    expect(result.ranking.commonCriteria).not.toContain('game-signs')
    expect(result.ranking.status).toBe('tied')
    expect(result.ranking.summary).toContain('aucun ordre')
    expect(result.ranking.entries.every((e) => e.rank === 1)).toBe(true)
    expect(result.ranking.entries[0].reasons.join(' ')).toContain('hors tri')
    // La couverture de chacun reste affichée.
    expect(result.rows.map((r) => r.coverage.text)).toEqual([
      '5/5 critères évaluables',
      '4/5 critères évaluables',
    ])
  })

  it('shares a rank between tied waypoints and says nothing else separates them', () => {
    const field = makeWindField([A, B, C], (_h, index) =>
      index === 2 ? { speedKmh: 40 } : {},
    )
    const result = compareCaches(
      input([wp('a', A), wp('b', B), wp('c', C)], { windField: field }),
    )
    expect(result.ranking.status).toBe('ranked')
    expect(result.ranking.entries.map((e) => [e.waypointId, e.rank])).toEqual([
      ['a', 1],
      ['b', 1],
      ['c', 3],
    ])
    expect(result.ranking.entries[0].reasons.join(' ')).toContain('Ex æquo avec Cache b')
  })

  it('refuses to rank when too many data are missing, and says why', () => {
    // Heure absente des données de vent : aucun vent : seul l’habitat reste évaluable.
    const result = compareCaches(
      input([wp('a', A), wp('b', B)], { hourKey: '2026-08-25T08:00' }),
    )
    expect(result.ranking.status).toBe('not-comparable')
    expect(result.ranking.entries).toEqual([])
    expect(result.ranking.summary).toContain('ne sont pas comparables')
    expect(result.ranking.excluded).toHaveLength(2)
    expect(result.ranking.excluded[0].reason).toContain('trop de données manquantes')
    expect(result.ranking.excluded[0].reason).toContain('1/5 critères évaluables')
  })

  it('ranks the documented waypoints and leaves the poorly documented one out', () => {
    const a = wp('a', A, { optimalWindDirections: [270] })
    const b = wp('b', B, { optimalWindDirections: [90] })
    const c = wp('c', C)
    // c n'a pas de végétation cartographiée ni de préférence : 2/5 évaluables.
    const result = compareCaches(
      input([a, b, c], {
        vegetation: [
          vegetation(A, { forest: 1 }),
          vegetation(B, { forest: 1 }),
          vegetation(C, {}),
        ],
        windField: makeWindField([A, B, C]),
      }),
    )
    // c : vitesse + précipitations seulement
    expect(result.rows[2].coverage.evaluable).toBe(2)
    expect(result.ranking.excluded.map((e) => e.waypointId)).toEqual(['c'])
    expect(result.ranking.entries.map((e) => e.waypointId)).toEqual(['a', 'b'])
    expect(result.ranking.status).toBe('ranked')
  })

  it('is not comparable when fewer than 2 criteria are evaluable for all ranked points', () => {
    const base = compareCaches(
      input([
        wp('a', A, { optimalWindDirections: [270] }),
        wp('b', B, { optimalWindDirections: [270] }),
      ]),
    )
    // Lignes synthétiques : a n'a que 3 critères (vent), b seulement 3 autres.
    const withStatuses = (row: (typeof base.rows)[number], met: CriterionId[]) => ({
      ...row,
      criteria: row.criteria.map((c) => ({
        ...c,
        status: met.includes(c.id) ? ('met' as const) : ('not-evaluable' as const),
      })),
      coverage: { ...row.coverage, evaluable: met.length },
    })
    const rows = [
      withStatuses(base.rows[0], ['wind-direction', 'wind-speed', 'precipitation']),
      withStatuses(base.rows[1], ['habitat', 'game-signs', 'precipitation']),
    ]
    const ranking = rankRows(rows)
    expect(ranking.status).toBe('not-comparable')
    expect(ranking.commonCriteria).toEqual(['precipitation'])
    expect(ranking.summary).toContain('moins de 2 critères sont évaluables pour tous')
    expect(ranking.entries).toEqual([])
  })

  it('says it cannot rank outside 2 to 4 waypoints', () => {
    expect(compareCaches(input([wp('a', A)])).ranking.status).toBe('not-comparable')
    const five = [wp('a', A), wp('b', B), wp('c', C), wp('d', D), wp('e', A)]
    expect(compareCaches(input(five)).ranking.status).toBe('not-comparable')
  })

  it('is deterministic and never invents a score', () => {
    const waypoints = [wp('a', A, { optimalWindDirections: [270] }), wp('b', B)]
    const first = compareCaches(input(waypoints))
    const second = compareCaches(input(waypoints))
    expect(second).toEqual(first)
    expect(JSON.stringify(first)).not.toMatch(/"(overallScore|probability|successRate)"/)
    expect(first.disclaimer).toBe(
      'Comparaison indicative : ce n’est pas une prévision de réussite.',
    )
    expect(first.criteria.map((c) => c.id)).toEqual([...CRITERION_ORDER])
    expect(first.rules.length).toBeGreaterThan(3)
  })
})

describe('compareCaches — advantages and drawbacks', () => {
  it('lists met criteria as advantages and not-met ones as drawbacks, nothing for missing data', () => {
    const field = makeWindField([A, B], () => ({ speedKmh: 30 }))
    const a = wp('a', A, { optimalWindDirections: [270] })
    const result = compareCaches(input([a, wp('b', B)], { windField: field }))
    const row = result.rows[0]
    expect(row.advantages.join(' ')).toContain('Vent dans une direction préférée')
    expect(row.drawbacks.join(' ')).toContain('vent fort')
    // Un critère non évaluable n'est ni avantage ni inconvénient.
    expect(row.advantages.join(' ')).not.toContain('Signe de gibier')
    expect(row.drawbacks.join(' ')).not.toContain('Signe de gibier')
    expect(row.missingData.join(' ')).toContain('Signes de gibier')
  })
})

describe('compareCaches — personal observations (separate counts)', () => {
  const center = wp('c', A)
  const sign1 = wp('s1', { lat: 46.8005, lng: -71.2 }, { category: 'game_sign' })
  const camera = wp('s2', { lat: 46.801, lng: -71.2 }, { category: 'trail_camera' })
  const far = wp('s3', { lat: 46.9, lng: -71.2 }, { category: 'game_sign' })
  const stand = wp('st', { lat: 46.8002, lng: -71.2 }, { category: 'stand_blind' })
  const track: Track = {
    id: 't1',
    name: 'Sortie',
    startedAt: '2026-08-10T10:00:00.000Z',
    points: [
      { ...A, timestamp: '2026-08-10T10:00:00.000Z' },
      { lat: 46.9, lng: -71.3, timestamp: '2026-08-10T10:30:00.000Z' },
    ],
  }
  const journal: Observation = {
    id: 'j1',
    coordinate: { lat: 46.8003, lng: -71.2 },
    timestamp: '2026-08-12T08:00:00.000Z',
    notes: 'Traces fraîches près du ruisseau',
  }
  const linkedFar: Observation = {
    id: 'j2',
    coordinate: { lat: 46.95, lng: -71.2 },
    timestamp: '2026-08-12T08:00:00.000Z',
    notes: 'Lié au point',
    waypointId: 'c',
  }

  it('counts visits, game signs and journal entries separately and excludes the waypoint itself', () => {
    const selfSign = wp('self', A, { category: 'game_sign' })
    const all = [center, sign1, camera, far, stand, selfSign]
    const result = compareCaches(
      input([selfSign, wp('z', B)], {
        records: records([...all, wp('z', B)], {
          tracks: [track],
          observations: [journal],
        }),
      }),
    )
    const o = result.rows[0].observations
    // Le point comparé (selfSign) n'est pas son propre signe ; les 2 autres proches comptent.
    expect(o.gameSigns.count).toBe(2)
    expect(o.gameSigns.items.map((i) => i.id)).not.toContain('self')
    expect(o.visits.count).toBe(1)
    expect(o.journalEntries.count).toBe(1)
    expect(o.animalsObserved.status).toBe('unavailable')
    expect(o.animalsObserved.reason).toContain('aucune donnée structurée')
  })

  it('counts exactly the nearby game-sign waypoints (stand and far sign excluded)', () => {
    const all = [center, sign1, camera, far, stand]
    const result = compareCaches(
      input([center, wp('z', B)], {
        records: records([...all, wp('z', B)], {
          tracks: [track],
          observations: [journal, linkedFar],
        }),
      }),
    )
    const o = result.rows[0].observations
    expect(o.gameSigns.items.map((i) => i.id)).toEqual(['s1', 's2'])
    expect(o.visits).toEqual({ count: 1, trackIds: ['t1'] })
    // Une entrée liée par waypointId compte même éloignée.
    expect(o.journalEntries.items.map((i) => i.id).sort()).toEqual(['j1', 'j2'])
    expect(status(result, 'c', 'game-signs')).toBe('met')
    expect(result.rows[1].observations.gameSigns.count).toBe(0)
    expect(status(result, 'z', 'game-signs')).toBe('not-evaluable')
  })

  it('visits and journal entries do not become game signs', () => {
    const result = compareCaches(
      input([center, wp('z', B)], {
        records: records([center, wp('z', B)], {
          tracks: [track],
          observations: [journal],
        }),
      }),
    )
    expect(result.rows[0].observations.visits.count).toBe(1)
    expect(result.rows[0].observations.gameSigns.count).toBe(0)
    expect(status(result, 'c', 'game-signs')).toBe('not-evaluable')
  })
})

describe('compareCaches — distance from my position', () => {
  const NOW_MS = NOW.getTime()
  const fix = (
    overrides: Partial<{ ageMs: number; accuracy: number | undefined }> = {},
  ): GeolocationReading => ({
    status: 'available',
    confidence: 'measured',
    source: 'browser-geolocation',
    value: {
      lat: 46.8,
      lng: -71.2,
      accuracyMeters: 'accuracy' in overrides ? overrides.accuracy : 8,
      timestampMs: NOW_MS - (overrides.ageMs ?? 3000),
    },
  })
  const waypoints = [wp('a', { lat: 46.81, lng: -71.2 }), wp('b', B)]

  it('gives a straight-line distance with a fresh, precise fix', () => {
    const result = compareCaches(input(waypoints, { gps: fix() }))
    const position = result.rows[0].position
    expect(position.status).toBe('available')
    if (position.status !== 'available') return
    expect(position.distanceMeters).toBeGreaterThan(1100)
    expect(position.distanceMeters).toBeLessThan(1120)
    expect(position.accuracyMeters).toBe(8)
    expect(position.ageText).toContain('il y a 3 s')
  })

  it.each([
    ['no GPS reading', null, 'aucune lecture GPS'],
    [
      'GPS denied',
      {
        status: 'unavailable',
        kind: 'denied',
        reason: 'Autorisation de localisation refusée.',
      } as GeolocationReading,
      'Autorisation de localisation refusée',
    ],
    ['a fix that is not fresh', fix({ ageMs: 60_000 }), 'non frais'],
    ['a stale fix', fix({ ageMs: 600_000 }), 'non frais'],
    ['an unknown accuracy', fix({ accuracy: undefined }), 'précision du GPS inconnue'],
    ['a poor accuracy', fix({ accuracy: 500 }), 'précision insuffisante'],
  ])('says the position is unavailable with %s', (_label, gps, expected) => {
    const result = compareCaches(input(waypoints, { gps }))
    const position = result.rows[0].position
    expect(position.status).toBe('unavailable')
    expect(position.status === 'unavailable' && position.reason).toContain(expected)
    expect(position.status === 'unavailable' && position.reason).toContain(
      'Position indisponible',
    )
  })
})

describe('compareCaches — habitat reuses the potential-map analyzers', () => {
  it('is "met" exactly when the vegetation analyzer index is above neutral', () => {
    const forest = vegetation(A, { forest: 1 })
    const developed = vegetation(B, { developed: 1 })
    expect(vegetationAnalyzer(forest).score).toBeGreaterThan(HABITAT_NEUTRAL_INDEX)
    expect(vegetationAnalyzer(developed).score).toBeLessThan(HABITAT_NEUTRAL_INDEX)
    const result = compareCaches(
      input([wp('a', A), wp('b', B)], { vegetation: [forest, developed] }),
    )
    expect(status(result, 'a', 'habitat')).toBe('met')
    expect(status(result, 'b', 'habitat')).toBe('not-met')
  })

  it('attributes each waypoint to its nearest vegetation grid sample', () => {
    const result = compareCaches(
      input([wp('a', A), wp('b', C)], {
        vegetation: [vegetation(B, { developed: 1 }), vegetation(D, { forest: 1 })],
      }),
    )
    expect(status(result, 'a', 'habitat')).toBe('not-met')
    expect(status(result, 'b', 'habitat')).toBe('met')
  })
})

describe('criteria thresholds stay aligned with the analyzers', () => {
  const reading = (speedKmh: number, precip = 0): WindHourlyReading => ({
    time: NOW_KEY,
    directionDegrees: 270,
    speedKmh,
    gustsKmh: speedKmh,
    temperatureCelsius: 18,
    precipitationMm: precip,
    cloudCoverPercent: 0,
  })
  const labels = (speed: number) =>
    windAnalyzer(reading(speed), undefined).factors.map((f) => f.label)

  it('wind speed band matches windAnalyzer (calm < 5, sustained ≤ 25, strong > 25)', () => {
    expect(labels(WIND_CALM_KMH - 0.1)).toEqual(['Très calme'])
    expect(labels(WIND_CALM_KMH)).toEqual(['Vent soutenu'])
    expect(labels(WIND_STRONG_KMH)).toEqual(['Vent soutenu'])
    expect(labels(WIND_STRONG_KMH + 0.1)).toEqual(['Vent fort'])
  })

  it('heavy precipitation matches weatherAnalyzer (> 4 mm/h)', () => {
    const weather = makeWeather()
    const at = (mm: number) =>
      weatherAnalyzer({ ...weather.current, precipitationMm: mm }, [], {
        includeWindSpeed: false,
      }).factors.map((f) => f.label)
    expect(at(HEAVY_PRECIPITATION_MM)).not.toContain('Fortes précipitations')
    expect(at(HEAVY_PRECIPITATION_MM + 0.1)).toContain('Fortes précipitations')
  })

  it('applies the speed band on the boundaries', () => {
    const run = (speed: number) => {
      const field = makeWindField([A, B], () => ({ speedKmh: speed }))
      return status(
        compareCaches(input([wp('a', A), wp('b', B)], { windField: field })),
        'a',
        'wind-speed',
      )
    }
    expect(run(4.9)).toBe('not-met')
    expect(run(5)).toBe('met')
    expect(run(25)).toBe('met')
    expect(run(25.1)).toBe('not-met')
    const precip = (mm: number) =>
      status(
        compareCaches(
          input([wp('a', A), wp('b', B)], {
            windField: makeWindField([A, B], () => ({ precipitationMm: mm })),
          }),
        ),
        'a',
        'precipitation',
      )
    expect(precip(4)).toBe('met')
    expect(precip(4.1)).toBe('not-met')
  })
})
