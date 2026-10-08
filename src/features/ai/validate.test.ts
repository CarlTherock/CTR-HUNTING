import { describe, expect, it } from 'vitest'
import { ResultBuilder } from './resultBuilder'
import { findTraceabilityProblems } from './validate'
import type { AssistantResult, EntityRef } from './types'

const NOW = new Date('2026-10-07T12:00:00.000Z')
const REF: EntityRef = { kind: 'waypoint', id: 'w1', label: 'Poste' }

function good(): AssistantResult {
  const builder = new ResultBuilder('history-search', 'Essai', NOW)
  builder
    .section('Faits')
    .fact('Un point.', [REF])
    .calc('Un total.')
    .estimate('Une valeur.')
  return builder.build()
}

describe('findTraceabilityProblems — le contrôle détecte vraiment les défauts', () => {
  it('accepte un résultat bien formé', () => {
    expect(findTraceabilityProblems(good())).toEqual([])
  })

  it('détecte un énoncé sans étiquette de nature valide', () => {
    const result = good()
    const broken = {
      ...result,
      sections: [
        {
          heading: 'X',
          statements: [
            { id: 's1', text: 'Sans étiquette', nature: '' as never, refs: [] },
          ],
        },
      ],
    }
    expect(findTraceabilityProblems(broken)).toEqual([
      'énoncé s1 sans étiquette de nature valide',
    ])
  })

  it('refuse « interprétation IA » dans un résultat déterministe', () => {
    const result = good()
    result.sections[0].statements[0].nature = 'interprétation IA' as never
    expect(findTraceabilityProblems(result).join('|')).toContain(
      '« interprétation IA » dans un résultat déterministe',
    )
  })

  it('détecte un lien absent du contexte et un énoncé vide', () => {
    const result = good()
    result.context.consulted = []
    result.sections[0].statements[1].text = '   '
    const problems = findTraceabilityProblems(result)
    expect(problems).toContain('lien waypoint:w1 absent du contexte')
    expect(problems.some((p) => p.includes('vide'))).toBe(true)
  })

  it('le constructeur déduplique les éléments consultés et plafonne les liens par énoncé', () => {
    const builder = new ResultBuilder('history-search', 'Essai', NOW)
    const many: EntityRef[] = Array.from({ length: 30 }, (_, i) => ({
      kind: 'journal',
      id: `j${i}`,
      label: `Entrée ${i}`,
    }))
    builder
      .section('Liste')
      .fact('Trente entrées.', many)
      .fact('Encore la première.', [many[0]])
    const result = builder.build()
    const [first] = result.sections[0].statements
    expect(first.refs).toHaveLength(20)
    expect(first.text).toContain('10 autre(s) non listé(s) ici')
    // Les 30 sont consultés, sans doublon.
    expect(result.context.consultedTotal).toBe(30)
    expect(findTraceabilityProblems(result)).toEqual([])
  })
})
