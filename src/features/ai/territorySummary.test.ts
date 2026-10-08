import { describe, expect, it } from 'vitest'
import { isAbortError } from './chunking'
import { summarizeTerritory, summarizeTerritoryAsync } from './territorySummary'
import {
  HOSTILE_NOTE,
  bigRecords,
  entry,
  sampleRecords,
  track,
  waypoint,
} from './testFixtures'
import { findTraceabilityProblems } from './validate'
import type { AssistantResult } from './types'

const NOW = new Date('2026-10-07T12:00:00.000Z')

function texts(result: AssistantResult, heading?: string): string[] {
  return result.sections
    .filter((s) => heading === undefined || s.heading.startsWith(heading))
    .flatMap((s) => s.statements.map((st) => st.text))
}
function refIds(result: AssistantResult, heading: string): string[] {
  return result.sections
    .filter((s) => s.heading.startsWith(heading))
    .flatMap((s) => s.statements.flatMap((st) => st.refs.map((r) => r.id)))
}

describe('summarizeTerritory — comptes, traces, journal, photos, période', () => {
  const records = sampleRecords()
  const result = summarizeTerritory({
    scope: { kind: 'territory', id: 'nord' },
    records,
    now: NOW,
  })

  it('compte les points par catégorie, avec les identifiants', () => {
    const content = texts(result, 'Contenu')
    expect(content[0]).toContain('3 points de repère')
    expect(content.some((t) => t === 'Indice de gibier : 2')).toBe(true)
    expect(content.some((t) => t === 'Poste / cache : 1')).toBe(true)
    expect(refIds(result, 'Contenu').sort()).toEqual(['w1', 'w2', 'w3'])
  })

  it('totalise distance et durée, et dit combien de traces comptent', () => {
    const traces = texts(result, 'Traces')
    expect(traces[0]).toContain('2 traces GPS')
    // t1 = 2500 m enregistrés ; t3 = distance recalculée depuis ses points (~1,1 km).
    const distance = traces.find((t) => t.startsWith('Distance totale'))
    expect(distance).toContain('3,61')
    expect(distance).toContain('2/2 trace(s)')
    // t3 n'a pas de fin : durée connue pour 1 trace sur 2.
    const duration = traces.find((t) => t.startsWith('Durée totale'))
    expect(duration).toContain('1/2 trace(s)')
    expect(result.context.missingData.join(' ')).toContain('sans durée connue')
  })

  it('compte les entrées de journal et les photos rattachées', () => {
    const journal = texts(result, 'Journal')
    expect(journal[0]).toContain('2 entrées de journal')
    expect(journal[0]).toContain('dont 2 avec des conditions enregistrées')
    expect(journal[1]).toContain('3 photos rattachées')
    expect(journal[1]).toContain('2 à des points de repère, 1 à des entrées de journal')
    expect(refIds(result, 'Journal').sort()).toEqual(['j1', 'j2'])
  })

  it('donne la période couverte et les derniers éléments, plus récent d’abord', () => {
    const period = texts(result, 'Période')
    expect(period[0]).toContain('2026-09-20')
    expect(period[0]).toContain('2026-10-04')
    const recent = result.sections.find((s) => s.heading.startsWith('Derniers'))
    expect(recent?.statements[0].refs[0].id).toBe('j1')
    expect(recent?.statements.length).toBeLessThanOrEqual(5)
  })

  it('est traçable : toutes les natures, tous les liens dans le contexte', () => {
    expect(findTraceabilityProblems(result)).toEqual([])
    expect(result.context.consulted.map((r) => r.id).sort()).toEqual(
      ['j1', 'j2', 't1', 't3', 'w1', 'w2', 'w3'].sort(),
    )
    expect(result.context.dataUsed.length).toBeGreaterThan(0)
    expect(result.context.sources.length).toBeGreaterThan(0)
    expect(result.originLabel).toBe('Calcul / résumé automatique')
  })

  it('étiquette les comptes « fait enregistré » et les totaux « calcul »', () => {
    const counts = result.sections
      .find((s) => s.heading === 'Contenu')
      ?.statements.every((s) => s.nature === 'fait enregistré')
    expect(counts).toBe(true)
    const total = result.sections
      .find((s) => s.heading === 'Traces')
      ?.statements.find((s) => s.text.startsWith('Distance totale'))
    expect(total?.nature).toBe('calcul')
  })
})

describe('summarizeTerritory — portées', () => {
  const records = sampleRecords()

  it('« Non classé » ne reprend que les éléments sans territoire', () => {
    const result = summarizeTerritory({
      scope: { kind: 'unclassified' },
      records,
      now: NOW,
    })
    expect(result.context.consulted.map((r) => r.id)).toEqual(['w5'])
    expect(texts(result, 'Traces')[0]).toBe('Aucune trace GPS.')
  })

  it('« Tous » reprend tout', () => {
    const result = summarizeTerritory({ scope: { kind: 'all' }, records, now: NOW })
    expect(result.context.consultedTotal).toBe(5 + 3 + 3)
  })

  it('un territoire vide le dit et signale la donnée manquante', () => {
    const empty = {
      ...records,
      waypoints: [],
      tracks: [],
      observations: [],
    }
    const result = summarizeTerritory({
      scope: { kind: 'territory', id: 'nord' },
      records: empty,
      now: NOW,
    })
    expect(texts(result)[0]).toContain('Aucun élément enregistré')
    expect(result.context.missingData.length).toBe(1)
    expect(findTraceabilityProblems(result)).toEqual([])
  })

  it('ignore les dates invalides au lieu d’inventer une période', () => {
    const result = summarizeTerritory({
      scope: { kind: 'all' },
      records: {
        territories: [],
        waypoints: [waypoint('x', { createdAt: 'pas une date' })],
        tracks: [],
        observations: [],
      },
      now: NOW,
    })
    expect(texts(result, 'Période')[0]).toContain('période indisponible')
  })
})

describe('summarizeTerritory — notes hostiles : des données, jamais des consignes', () => {
  const hostile = {
    territories: [],
    waypoints: [waypoint('h1', { name: HOSTILE_NOTE, notes: HOSTILE_NOTE })],
    tracks: [track('ht', { name: HOSTILE_NOTE })],
    observations: [entry('hj', { notes: `${HOSTILE_NOTE}\u0000‮`.repeat(5) })],
  }
  const clean = {
    territories: [],
    waypoints: [waypoint('h1')],
    tracks: [track('ht')],
    observations: [entry('hj')],
  }
  const result = summarizeTerritory({
    scope: { kind: 'all' },
    records: hostile,
    now: NOW,
  })
  const baseline = summarizeTerritory({
    scope: { kind: 'all' },
    records: clean,
    now: NOW,
  })

  it('ne change ni les comptes ni la structure du résultat', () => {
    const shape = (r: AssistantResult) =>
      r.sections.map((s) => [s.heading, s.statements.map((st) => st.nature)])
    expect(shape(result)).toEqual(shape(baseline))
    expect(texts(result, 'Contenu')[0]).toBe(texts(baseline, 'Contenu')[0])
  })

  it('tronque les textes cités et retire les caractères de contrôle', () => {
    for (const statement of result.sections.flatMap((s) => s.statements)) {
      expect(statement.text.length).toBeLessThan(400)
      // eslint-disable-next-line no-control-regex
      expect(statement.text).not.toMatch(/[\u0000-\u0008‮]/)
      for (const ref of statement.refs) {
        expect(ref.label.length).toBeLessThanOrEqual(80)
        expect((ref.excerpt ?? '').length).toBeLessThanOrEqual(121)
      }
    }
  })

  it('n’ajoute jamais « interprétation IA » ni lien inventé', () => {
    expect(findTraceabilityProblems(result)).toEqual([])
    const natures = new Set(
      result.sections.flatMap((s) => s.statements.map((st) => st.nature)),
    )
    expect(natures.has('interprétation IA' as never)).toBe(false)
  })
})

describe('summarizeTerritoryAsync — grosses collections et annulation', () => {
  it('donne le même résultat que la version synchrone', async () => {
    const records = sampleRecords()
    const input = { scope: { kind: 'all' } as const, records, now: NOW }
    expect(await summarizeTerritoryAsync(input)).toEqual(summarizeTerritory(input))
  })

  it('traite des milliers d’éléments en rendant la main entre les tranches', async () => {
    const records = bigRecords(3000)
    let yields = 0
    let clock = 0
    const result = await summarizeTerritoryAsync(
      { scope: { kind: 'all' }, records, now: NOW },
      {
        // Horloge simulée : 1 ms par élément -> une tranche de 8 ms rend la main.
        now: () => (clock += 1),
        yieldFn: () => {
          yields += 1
          return Promise.resolve()
        },
      },
    )
    expect(yields).toBeGreaterThan(100)
    expect(texts(result, 'Contenu')[0]).toContain('3000 points de repère')
    expect(result.context.consultedTotal).toBe(9000)
    expect(result.context.consulted.length).toBe(200)
  })

  it('s’arrête quand le calcul est annulé (résultat périmé)', async () => {
    const controller = new AbortController()
    let clock = 0
    const promise = summarizeTerritoryAsync(
      { scope: { kind: 'all' }, records: bigRecords(2000), now: NOW },
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
