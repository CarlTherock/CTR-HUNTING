import type { GuideSection, GuideSource } from './apresTir.content'

export const GUIDE_PENDING_LABEL = 'Contenu à venir — sources en vérification'

/** A source counts only if it can actually be looked up: a title, a
 * publisher and a retrieval date (`YYYY-MM-DD`). */
export function isValidSource(source: GuideSource | null): source is GuideSource {
  if (!source) return false
  return (
    source.title.trim() !== '' &&
    source.publisher.trim() !== '' &&
    /^\d{4}-\d{2}-\d{2}$/.test(source.retrievedOn)
  )
}

/** A section is published only with a valid source AND some text. Anything
 * else stays « à venir » — the app never shows unsourced advice. */
export function isSectionPublished(section: GuideSection): boolean {
  return (
    isValidSource(section.source) && section.body.some((paragraph) => paragraph.trim())
  )
}
