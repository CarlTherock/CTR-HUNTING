import { describe, expect, it } from 'vitest'
import { APRES_TIR_SECTIONS, type GuideSection } from './apresTir.content'
import { isSectionPublished, isValidSource } from './guideLogic'

const SOURCE = {
  title: 'Document d’essai',
  publisher: 'Éditeur d’essai',
  retrievedOn: '2026-10-08',
}

describe('guide « Après le tir » : aucune section sans source', () => {
  it('la structure livrée ne publie aucune section (aucun contenu expert, aucune source)', () => {
    expect(APRES_TIR_SECTIONS.length).toBeGreaterThan(0)
    for (const section of APRES_TIR_SECTIONS) {
      expect(section.body, section.id).toEqual([])
      expect(section.source, section.id).toBeNull()
      expect(isSectionPublished(section), section.id).toBe(false)
    }
  })

  it('les identifiants de section sont uniques', () => {
    const ids = APRES_TIR_SECTIONS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('une source doit avoir un titre, un éditeur et une date de consultation valide', () => {
    expect(isValidSource(null)).toBe(false)
    expect(isValidSource(SOURCE)).toBe(true)
    expect(isValidSource({ ...SOURCE, title: ' ' })).toBe(false)
    expect(isValidSource({ ...SOURCE, publisher: '' })).toBe(false)
    expect(isValidSource({ ...SOURCE, retrievedOn: '8 octobre' })).toBe(false)
  })

  it('un texte sans source, ou une source sans texte, reste « à venir »', () => {
    const base: GuideSection = { id: 'x', title: 'T', body: ['Texte'], source: null }
    expect(isSectionPublished(base)).toBe(false)
    expect(isSectionPublished({ ...base, body: [], source: SOURCE })).toBe(false)
    expect(isSectionPublished({ ...base, body: [' '], source: SOURCE })).toBe(false)
    expect(isSectionPublished({ ...base, source: SOURCE })).toBe(true)
  })
})
