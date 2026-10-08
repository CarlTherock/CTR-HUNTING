export interface HistoryEntry {
  title: string
  /** Date écrite dans le titre `## Titre (AAAA-MM-JJ)`, si elle y figure. */
  date?: string
}

/** Titres de version du CHANGELOG (lignes `## …`), du plus récent au plus ancien.
 * L'historique affiché est lu dans `CHANGELOG.md` lui-même : aucune seconde liste. */
export function parseChangelogHeadings(markdown: string, limit = 12): HistoryEntry[] {
  const entries: HistoryEntry[] = []
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^##\s+(.+?)\s*$/.exec(line)
    if (!match) continue
    const raw = match[1]
    const dated = /^(.*?)\s*\((\d{4}-\d{2}-\d{2})\)\s*$/.exec(raw)
    entries.push(dated ? { title: dated[1], date: dated[2] } : { title: raw })
    if (entries.length >= limit) break
  }
  return entries
}
