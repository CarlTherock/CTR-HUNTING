import { describe, expect, it } from 'vitest'
import {
  MIN_CONDITIONS_PER_PERIOD,
  MIN_ITEMS_PER_PERIOD,
  comparePeriods,
  comparePeriodsAsync,
} from './periods'
import type { PeriodInput } from './periods'
import type { AssistantRecords } from './records'
import { bigRecords, conditions, entry, track, waypoint } from './testFixtures'
import { findTraceabilityProblems } from './validate'
import type { AssistantResult } from './types'

const NOW = new Date('2026-10-07T12:00:00.000Z')
const A: PeriodInput = { label: 'Septembre', from: '2026-09-01', to: '2026-09-30' }
const B: PeriodInput = { label: 'Octobre', from: '2026-10-01', to: '2026-10-31' }

function all(result: AssistantResult): string {
  return result.sections.flatMap((s) => s.statements.map((st) => st.text)).join('\n')
}

/** `n` entrées de journal à midi UTC du jour donné, avec vent et direction. */
function journal(
  prefix: string,
  month: string,
  winds: [number, number][],
): AssistantRecords['observations'] {
  return winds.map(([speed, direction], i) =>
    entry(`${prefix}${i}`, {
      timestamp: `${month}-${String(10 + i).padStart(2, '0')}T12:00:00.000Z`,
      conditions: conditions(speed, direction, 4 + i, 30 + i * 10),
    }),
  )
}

const empty = (): AssistantRecords => ({
  territories: [],
  waypoints: [],
  tracks: [],
  observations: [],
})

describe('comparePeriods — données insuffisantes : refuse de conclure', () => {
  it('le seuil minimal est explicite', () => {
    expect(MIN_ITEMS_PER_PERIOD).toBe(3)
    expect(MIN_CONDITIONS_PER_PERIOD).toBe(3)
  })

  it('moins de 3 éléments dans une période : comptes montrés, aucune comparaison', () => {
    const records: AssistantRecords = {
      ...empty(),
      waypoints: [
        waypoint('a1', { createdAt: '2026-09-10T12:00:00.000Z' }),
        waypoint('a2', { createdAt: '2026-09-11T12:00:00.000Z' }),
        waypoint('b1', { createdAt: '2026-10-10T12:00:00.000Z' }),
        waypoint('b2', { createdAt: '2026-10-11T12:00:00.000Z' }),
        waypoint('b3', { createdAt: '2026-10-12T12:00:00.000Z' }),
        waypoint('b4', { createdAt: '2026-10-13T12:00:00.000Z' }),
        waypoint('b5', { createdAt: '2026-10-14T12:00:00.000Z' }),
      ],
    }
    const out = comparePeriods({ a: A, b: B, records, now: NOW })
    expect(out.status).toBe('insufficient')
    const text = all(out.result)
    expect(text).toContain('Données insuffisantes')
    expect(text).toContain('seuil est de 3 éléments par période')
    expect(text).toContain('la période A en a 2 et la période B en a 5')
    // Les comptes sont des faits, mais AUCUNE comparaison n'est énoncée.
    expect(out.result.sections.map((s) => s.heading)).not.toContain(
      'Comparaison des quantités (calculée)',
    )
    expect(text).not.toContain('écart')
    expect(out.result.context.missingData[0]).toContain('moins de 3 éléments')
    expect(findTraceabilityProblems(out.result)).toEqual([])
  })

  it('exactement 3 éléments par période suffit', () => {
    const records: AssistantRecords = {
      ...empty(),
      waypoints: [
        ...['a1', 'a2', 'a3'].map((id, i) =>
          waypoint(id, { createdAt: `2026-09-1${i}T12:00:00.000Z` }),
        ),
        ...['b1', 'b2', 'b3'].map((id, i) =>
          waypoint(id, { createdAt: `2026-10-1${i}T12:00:00.000Z` }),
        ),
      ],
    }
    expect(comparePeriods({ a: A, b: B, records, now: NOW }).status).toBe('sufficient')
    const twoAndThree = {
      ...records,
      waypoints: records.waypoints.filter((w) => w.id !== 'a3'),
    }
    expect(comparePeriods({ a: A, b: B, records: twoAndThree, now: NOW }).status).toBe(
      'insufficient',
    )
  })

  it('aucune donnée du tout : insuffisant, sans erreur', () => {
    const out = comparePeriods({ a: A, b: B, records: empty(), now: NOW })
    expect(out.status).toBe('insufficient')
    expect(all(out.result)).toContain('la période A en a 0 et la période B en a 0')
  })
})

describe('comparePeriods — données suffisantes', () => {
  const records: AssistantRecords = {
    ...empty(),
    waypoints: [
      waypoint('a1', { createdAt: '2026-09-05T12:00:00.000Z' }),
      waypoint('b1', { createdAt: '2026-10-05T12:00:00.000Z' }),
    ],
    tracks: [
      track('ta', { startedAt: '2026-09-06T12:00:00.000Z', distanceMeters: 2000 }),
      track('tb', {
        startedAt: '2026-10-06T12:00:00.000Z',
        endedAt: '2026-10-06T14:00:00.000Z',
        distanceMeters: 5000,
      }),
    ],
    observations: [
      ...journal('ja', '2026-09', [
        [10, 350],
        [20, 10],
        [30, 0],
      ]),
      ...journal('jb', '2026-10', [
        [20, 90],
        [30, 90],
        [40, 90],
      ]),
    ],
  }
  const out = comparePeriods({ a: A, b: B, records, now: NOW })
  const text = all(out.result)

  it('compare les quantités enregistrées', () => {
    expect(out.status).toBe('sufficient')
    expect(out.a).toMatchObject({ waypoints: 1, tracks: 1, journal: 3, items: 5 })
    expect(out.b).toMatchObject({ waypoints: 1, tracks: 1, journal: 3, items: 5 })
    expect(text).toContain(
      'Éléments enregistrés : 5 en période A, 5 en période B (écart +0)',
    )
    expect(text).toContain('Points de repère : 1 contre 1 ; traces : 1 contre 1')
  })

  it('compare distance parcourue et durée des traces terminées', () => {
    expect(text).toContain('Distance parcourue')
    expect(text).toContain('2,00')
    expect(text).toContain('5,00')
  })

  it('moyenne les conditions enregistrées, avec le nombre d’entrées', () => {
    expect(out.a?.meanWindSpeedKmh).toBeCloseTo(20)
    expect(out.b?.meanWindSpeedKmh).toBeCloseTo(30)
    expect(text).toContain(
      'Vitesse moyenne du vent : 20,0 km/h contre 30,0 km/h (écart −10,0 km/h), sur 3 et 3 entrée(s)',
    )
    expect(text).toContain('Température moyenne')
  })

  it('utilise une moyenne circulaire pour la direction (350°, 10° et 0° donnent le nord)', () => {
    expect(out.a?.windDirection?.mean ?? 99).toBeLessThan(1)
    expect(text).toContain(
      'Direction moyenne du vent (moyenne circulaire) : N (0°) contre E (90°)',
    )
  })

  it('n’annonce ni tendance, ni cause, ni prévision', () => {
    expect(text).toContain('ce n’est ni une tendance, ni une cause, ni une prévision')
    for (const word of [
      'augmente',
      'diminue',
      'hausse',
      'baisse',
      'va ',
      'prévoit',
      'meilleur',
    ]) {
      expect(text.toLowerCase()).not.toContain(word)
    }
  })

  it('est traçable, étiquette les comptes en faits et les écarts en calculs', () => {
    expect(findTraceabilityProblems(out.result)).toEqual([])
    const counts = out.result.sections.find((s) =>
      s.heading.startsWith('Ce qui est enregistré'),
    )
    expect(counts?.statements.every((s) => s.nature === 'fait enregistré')).toBe(true)
    const comparison = out.result.sections.find((s) =>
      s.heading.startsWith('Comparaison'),
    )
    expect(comparison?.statements.every((s) => s.nature === 'calcul')).toBe(true)
    // Les éléments des deux périodes sont cités et consultés.
    expect(out.result.context.consultedTotal).toBe(10)
  })
})

describe('comparePeriods — conditions et cas limites', () => {
  const base = (a: [number, number][], b: [number, number][]): AssistantRecords => ({
    ...empty(),
    observations: [...journal('ja', '2026-09', a), ...journal('jb', '2026-10', b)],
  })

  it('refuse la moyenne des conditions sous le seuil (même si les éléments suffisent)', () => {
    const records = base(
      [
        [10, 0],
        [20, 0],
        [30, 0],
      ],
      [
        [10, 0],
        [20, 0],
        [30, 0],
      ],
    )
    // Retire les conditions de deux entrées de la période B.
    records.observations = records.observations.map((o) =>
      o.id === 'jb0' || o.id === 'jb1' ? { ...o, conditions: undefined } : o,
    )
    const out = comparePeriods({ a: A, b: B, records, now: NOW })
    expect(out.status).toBe('sufficient')
    const text = all(out.result)
    expect(text).toContain('Conditions : données insuffisantes')
    expect(text).toContain('(A : 3, B : 1)')
    expect(text).not.toContain('Vitesse moyenne du vent')
  })

  it('refuse la direction moyenne quand les directions sont dispersées', () => {
    const scattered: [number, number][] = [
      [10, 0],
      [10, 90],
      [10, 180],
      [10, 270],
    ]
    const out = comparePeriods({
      a: A,
      b: B,
      records: base(scattered, scattered),
      now: NOW,
    })
    expect(all(out.result)).toContain('directions trop dispersées')
    expect(all(out.result)).not.toContain('Direction moyenne du vent (moyenne')
  })

  it('rejette une période invalide sans rien comparer', () => {
    const out = comparePeriods({
      a: { label: 'x', from: '2026-02-31', to: '2026-03-05' },
      b: B,
      records: empty(),
      now: NOW,
    })
    expect(out.status).toBe('invalid')
    expect(all(out.result)).toContain('Période A invalide')
    const reversed = comparePeriods({
      a: { label: 'x', from: '2026-09-30', to: '2026-09-01' },
      b: B,
      records: empty(),
      now: NOW,
    })
    expect(all(reversed.result)).toContain('le début est après la fin')
  })

  it('signale des périodes qui se chevauchent', () => {
    const out = comparePeriods({
      a: { label: 'A', from: '2026-09-01', to: '2026-10-05' },
      b: B,
      records: empty(),
      now: NOW,
    })
    expect(all(out.result)).toContain('se chevauchent')
  })

  it('respecte le territoire choisi', () => {
    const records: AssistantRecords = {
      territories: [{ id: 'nord', name: 'Nord', createdAt: 'x', updatedAt: 'x' }],
      tracks: [],
      observations: [],
      waypoints: [
        ...['a1', 'a2', 'a3'].map((id, i) =>
          waypoint(id, { createdAt: `2026-09-1${i}T12:00:00.000Z`, territoryId: 'nord' }),
        ),
        ...['b1', 'b2', 'b3'].map((id, i) =>
          waypoint(id, { createdAt: `2026-10-1${i}T12:00:00.000Z` }),
        ),
      ],
    }
    const nord = comparePeriods({
      a: A,
      b: B,
      records,
      scope: { kind: 'territory', id: 'nord' },
      now: NOW,
    })
    expect(nord.status).toBe('insufficient')
    expect(nord.a?.items).toBe(3)
    expect(nord.b?.items).toBe(0)
  })
})

describe('comparePeriodsAsync', () => {
  it('donne le même résultat que la version synchrone', async () => {
    const records = bigRecords(120)
    const input = {
      a: { label: 'A', from: '2026-09-01', to: '2026-09-14' },
      b: { label: 'B', from: '2026-09-15', to: '2026-09-28' },
      records,
      now: NOW,
    }
    expect(await comparePeriodsAsync(input)).toEqual(comparePeriods(input))
  })
})
