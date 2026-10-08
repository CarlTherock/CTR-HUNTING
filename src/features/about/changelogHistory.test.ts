import { describe, expect, it } from 'vitest'
import changelog from '../../../CHANGELOG.md?raw'
import { parseChangelogHeadings } from './changelogHistory'

describe('parseChangelogHeadings', () => {
  it('lit les titres datés et non datés, dans l’ordre du fichier', () => {
    const text =
      '# Changelog\n\n## Alpha (2026-10-07)\n- x\n## Beta\n### Added\n## Gamma (2026-09-25)\n'
    expect(parseChangelogHeadings(text)).toEqual([
      { title: 'Alpha', date: '2026-10-07' },
      { title: 'Beta' },
      { title: 'Gamma', date: '2026-09-25' },
    ])
  })

  it('respecte la limite', () => {
    expect(parseChangelogHeadings('## a\n## b\n## c', 2)).toHaveLength(2)
  })

  it('le CHANGELOG réel du dépôt fournit au moins une entrée', () => {
    expect(parseChangelogHeadings(changelog).length).toBeGreaterThan(0)
  })
})
