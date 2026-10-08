import { NATURE_ORDER } from './nature'
import type { AssistantResult } from './types'
import { CONSULTED_CAP } from './types'

/**
 * Contrôle de traçabilité d'un résultat. Renvoie la liste des problèmes
 * (vide = traçable). Utilisé par les tests de chaque outil et par
 * l'interface en développement : un énoncé sans étiquette, une étiquette
 * « interprétation IA » dans un résultat déterministe, ou un lien qui ne
 * figure pas dans le contexte sont des défauts, pas des détails.
 */
export function findTraceabilityProblems(result: AssistantResult): string[] {
  const problems: string[] = []
  const consulted = new Set(result.context.consulted.map((r) => `${r.kind}:${r.id}`))
  const complete = result.context.consultedTotal <= CONSULTED_CAP
  const seen = new Set<string>()

  if (result.origin !== 'deterministic') problems.push('origine inconnue')
  if (Number.isNaN(Date.parse(result.context.generatedAt))) {
    problems.push('date de calcul invalide')
  }
  if (result.context.tool !== result.tool) problems.push('outil du contexte incohérent')

  for (const section of result.sections) {
    if (!section.heading.trim()) problems.push('section sans titre')
    for (const statement of section.statements) {
      if (!statement.text.trim()) problems.push(`énoncé ${statement.id} vide`)
      if (!NATURE_ORDER.includes(statement.nature)) {
        problems.push(`énoncé ${statement.id} sans étiquette de nature valide`)
      }
      if ((statement.nature as string) === 'interprétation IA') {
        problems.push(
          `énoncé ${statement.id} : « interprétation IA » dans un résultat déterministe`,
        )
      }
      if (seen.has(statement.id))
        problems.push(`identifiant d'énoncé ${statement.id} en double`)
      seen.add(statement.id)
      for (const ref of statement.refs) {
        if (complete && !consulted.has(`${ref.kind}:${ref.id}`)) {
          problems.push(`lien ${ref.kind}:${ref.id} absent du contexte`)
        }
      }
    }
  }
  return problems
}
