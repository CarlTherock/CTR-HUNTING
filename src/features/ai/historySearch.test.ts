import { describe, expect, it } from 'vitest'
import { isAbortError } from './chunking'
import { searchHistory, searchHistoryAsync } from './historySearch'
import type { SearchCriteria } from './historySearch'
import { HOSTILE_NOTE, NORTH, bigRecords, entry, sampleRecords } from './testFixtures'
import { findTraceabilityProblems } from './validate'

const NOW = new Date('2026-10-07T12:00:00.000Z')
const records = sampleRecords()

const ids = (criteria: SearchCriteria) =>
  searchHistory(records, criteria, NOW)
    .hits.map((h) => h.ref.id)
    .sort()

describe('searchHistory — critères', () => {
  it('cherche un texte dans les noms et les notes, sans accent ni casse', () => {
    expect(ids({ text: 'CHEVREUIL' })).toEqual(['j1'])
    expect(ids({ text: 'vent de l’ouest' })).toEqual(['w1'])
    expect(ids({ text: 'sentier' })).toEqual(['w2'])
    expect(ids({ text: 'peche' })).toEqual([])
    expect(ids({ text: 'traces fraiches' })).toEqual(['j2'])
  })

  it('filtre par catégorie et exclut explicitement les autres types', () => {
    const out = searchHistory(records, { category: 'game_sign' }, NOW)
    expect(out.hits.map((h) => h.ref.id).sort()).toEqual(['w2', 'w3'])
    expect(out.result.sections[0].statements.map((s) => s.text).join(' ')).toContain(
      'ne s’applique qu’aux points de repère',
    )
  })

  it('filtre par période (jours inclus) sur les trois types', () => {
    expect(ids({ from: '2026-10-02', to: '2026-10-03' })).toEqual(['j2', 't1', 'w1'])
    expect(ids({ from: '2026-10-04', to: '2026-10-04' })).toEqual(['j1', 't3'])
    expect(ids({ to: '2026-08-31' })).toEqual(['j3', 't2', 'w4'])
  })

  it('filtre par territoire, y compris « non classé »', () => {
    expect(ids({ territory: { kind: 'territory', id: 'sud' } })).toEqual([
      'j3',
      't2',
      'w4',
    ])
    expect(ids({ territory: { kind: 'unclassified' } })).toEqual(['w5'])
  })

  it('filtre par proximité d’un point, avec la distance calculée', () => {
    const out = searchHistory(
      records,
      { near: { center: NORTH, radiusMeters: 100 } },
      NOW,
    )
    expect(out.hits.map((h) => h.ref.id).sort()).toEqual([
      'j1',
      'j2',
      't1',
      't3',
      'w1',
      'w2',
    ])
    const w2 = out.hits.find((h) => h.ref.id === 'w2')
    expect(w2?.distanceMeters).toBeGreaterThan(20)
    expect(w2?.distanceMeters).toBeLessThan(50)
    // Une distance calculée rend l'énoncé « calcul », pas « fait enregistré ».
    const statement = out.result.sections
      .flatMap((s) => s.statements)
      .find((s) => s.refs.some((r) => r.id === 'w2'))
    expect(statement?.nature).toBe('calcul')
    expect(ids({ near: { center: NORTH, radiusMeters: 10 } })).toEqual([
      'j1',
      'j2',
      't1',
      't3',
      'w1',
    ])
  })

  it('une trace est proche si un de ses points l’est', () => {
    const out = ids({
      kinds: ['track'],
      near: { center: { lat: 46.851, lng: -71.2 }, radiusMeters: 5 },
    })
    expect(out).toEqual(['t1'])
  })

  it('filtre par présence de photo (les traces n’en ont pas)', () => {
    const withPhoto = searchHistory(records, { hasPhoto: true }, NOW)
    expect(withPhoto.hits.map((h) => h.ref.id).sort()).toEqual(['j1', 'w1'])
    expect(withPhoto.hits.every((h) => h.photoCount > 0)).toBe(true)
    const without = ids({ hasPhoto: false })
    expect(without).not.toContain('t1')
    expect(without).toEqual(['j2', 'j3', 'w2', 'w3', 'w4', 'w5'])
  })

  it('filtre par vent enregistré et signale les entrées sans conditions', () => {
    const strong = searchHistory(records, { wind: { minSpeedKmh: 20 } }, NOW)
    expect(strong.hits.map((h) => h.ref.id)).toEqual(['j2'])
    expect(strong.hits[0].conditionsText).toContain('25 km/h')
    const joined = strong.result.sections[0].statements.map((s) => s.text).join(' ')
    expect(joined).toContain(
      'Les conditions de vent sont enregistrées seulement dans le journal',
    )
    expect(joined).toContain('1 entrée de journal sans conditions enregistrées')
    expect(strong.result.context.missingData.join(' ')).toContain('non évaluable')

    expect(
      ids({ wind: { fromDirection: { degrees: 270, toleranceDegrees: 22.5 } } }),
    ).toEqual(['j1'])
    expect(
      ids({ wind: { fromDirection: { degrees: 350, toleranceDegrees: 22.5 } } }),
    ).toEqual([])
    expect(ids({ wind: { minSpeedKmh: 10, maxSpeedKmh: 15 } })).toEqual(['j1'])
  })

  it('trie du plus récent au plus ancien', () => {
    const out = searchHistory(records, {}, NOW)
    expect(out.hits.map((h) => h.ref.id)).toEqual([
      'w5',
      'j1',
      't3',
      'w1',
      'j2',
      't1',
      'w3',
      'w2',
      'j3',
      't2',
      'w4',
    ])
    const times = out.hits.map((h) => h.time)
    expect([...times].sort((a, b) => b - a)).toEqual(times)
  })

  it('plafonne l’affichage mais garde le total exact', () => {
    const out = searchHistory(records, { limit: 3 }, NOW)
    expect(out.hits).toHaveLength(3)
    expect(out.total).toBe(11)
    const texts = out.result.sections.flatMap((s) => s.statements.map((st) => st.text))
    expect(texts.some((t) => t.includes('8 autre(s) résultat(s) non affiché(s)'))).toBe(
      true,
    )
  })

  it('dit quand rien ne correspond', () => {
    const out = searchHistory(records, { text: 'introuvable' }, NOW)
    expect(out.total).toBe(0)
    expect(out.result.sections.at(-1)?.statements[0].text).toBe(
      'Aucun élément ne correspond à ces critères.',
    )
  })
})

describe('searchHistory — critères invalides : jamais ignorés en silence', () => {
  it('signale une date mal formée', () => {
    const out = searchHistory(records, { from: '2026-13-45' }, NOW)
    expect(out.errors[0]).toContain('Date de début invalide')
    expect(out.result.context.missingData[0]).toContain('Date de début invalide')
  })

  it('ne renvoie rien quand le début est après la fin', () => {
    const out = searchHistory(records, { from: '2026-10-05', to: '2026-10-01' }, NOW)
    expect(out.total).toBe(0)
    expect(out.errors[0]).toContain('après la date de fin')
  })

  it('signale un rayon invalide', () => {
    const out = searchHistory(records, { near: { center: NORTH, radiusMeters: -5 } }, NOW)
    expect(out.errors[0]).toContain('Proximité invalide')
    expect(out.total).toBe(11)
  })
})

describe('searchHistory — texte cherché et notes hostiles : inertes', () => {
  const hostile = {
    territories: [],
    waypoints: [],
    tracks: [],
    observations: [entry('hx', { notes: HOSTILE_NOTE }), entry('hy', { notes: 'banal' })],
  }

  it('traite la requête comme du texte littéral, jamais comme une expression', () => {
    expect(searchHistory(hostile, { text: '.*' }, NOW).total).toBe(0)
    expect(searchHistory(hostile, { text: '(.*' }, NOW).total).toBe(0)
    expect(
      searchHistory(hostile, { text: '<script>' }, NOW).hits.map((h) => h.ref.id),
    ).toEqual(['hx'])
  })

  it('cite la note tronquée et ne change ni la structure ni les natures', () => {
    const out = searchHistory(hostile, { text: 'ignore tes instructions' }, NOW)
    expect(out.hits.map((h) => h.ref.id)).toEqual(['hx'])
    const [statement] = out.result.sections.at(-1)?.statements ?? []
    expect(statement.nature).toBe('fait enregistré')
    expect(statement.text.length).toBeLessThan(200)
    expect(statement.refs[0].excerpt?.length).toBeLessThanOrEqual(121)
    expect(findTraceabilityProblems(out.result)).toEqual([])
  })
})

describe('searchHistory — traçabilité', () => {
  it('chaque résultat a son lien et figure dans le contexte', () => {
    const out = searchHistory(
      records,
      { territory: { kind: 'territory', id: 'nord' } },
      NOW,
    )
    expect(findTraceabilityProblems(out.result)).toEqual([])
    const resultRefs = out.result.sections
      .at(-1)
      ?.statements.flatMap((s) => s.refs.map((r) => r.id))
      .sort()
    expect(resultRefs).toEqual(out.hits.map((h) => h.ref.id).sort())
    expect(out.result.context.consulted.length).toBe(out.hits.length)
    expect(out.result.context.sources).toContain(
      'Enregistrements de l’appareil (points de repère, traces, journal)',
    )
  })
})

describe('searchHistoryAsync', () => {
  it('donne le même résultat que la version synchrone', async () => {
    const criteria: SearchCriteria = {
      near: { center: NORTH, radiusMeters: 200 },
      from: '2026-09-01',
    }
    expect(await searchHistoryAsync(records, criteria, { at: NOW })).toEqual(
      searchHistory(records, criteria, NOW),
    )
  })

  it('parcourt des milliers d’éléments par tranches', async () => {
    const big = bigRecords(3000)
    let yields = 0
    let clock = 0
    const out = await searchHistoryAsync(
      big,
      { near: { center: { lat: 46.8, lng: -71.2 }, radiusMeters: 300 } },
      {
        at: NOW,
        // Horloge simulée : chaque élément coûte 1 ms.
        now: () => (clock += 1),
        yieldFn: () => {
          yields += 1
          return Promise.resolve()
        },
      },
    )
    expect(yields).toBeGreaterThan(100)
    expect(out.total).toBeGreaterThan(0)
    expect(out.hits.length).toBeLessThanOrEqual(50)
  })

  it('est annulable : un calcul périmé ne produit rien', async () => {
    const controller = new AbortController()
    let clock = 0
    const promise = searchHistoryAsync(
      bigRecords(2000),
      { text: 'point' },
      {
        signal: controller.signal,
        now: () => (clock += 10),
        yieldFn: async () => {
          controller.abort()
        },
      },
    )
    await expect(promise).rejects.toSatisfy((error: unknown) => isAbortError(error))
  })
})
