import { describe, expect, it } from 'vitest'
import { IMPLEMENTED_RULE_IDS } from '../engine'
import { SUPPORTING_LEVELS } from './types'
import { BIBLIOGRAPHY, RULE_REGISTRY, RULE_REGISTRY_VERSION } from './registry'

describe('registre des règles', () => {
  it('a une version et des identifiants uniques', () => {
    expect(RULE_REGISTRY_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    const ids = RULE_REGISTRY.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('les règles actives ou expérimentales sont exactement celles que le moteur exécute', () => {
    const executed = RULE_REGISTRY.filter(
      (r) => r.status === 'active' || r.status === 'experimental',
    ).flatMap((r) => r.implementedBy)
    expect([...executed].sort()).toEqual([...IMPLEMENTED_RULE_IDS].sort())
    for (const r of RULE_REGISTRY.filter(
      (x) => x.status === 'active' || x.status === 'experimental',
    )) {
      expect(r.implementedBy.length).toBeGreaterThan(0)
    }
  })

  it('une règle informative ou non prise en charge n’exécute rien', () => {
    for (const r of RULE_REGISTRY.filter(
      (x) => x.status === 'informatif' || x.status === 'non_pris_en_charge',
    )) {
      expect(r.implementedBy).toEqual([])
    }
  })

  it('une règle active ou expérimentale ne s’appuie que sur des sources dont le texte est récupéré, avec passage cité', () => {
    for (const r of RULE_REGISTRY.filter(
      (x) => x.status === 'active' || x.status === 'experimental',
    )) {
      for (const src of r.sources) {
        expect(SUPPORTING_LEVELS).toContain(src.verification)
        expect(src.locator?.length ?? 0).toBeGreaterThan(5)
        expect(src.provenance).toBe('synthese_documentaire_fournie')
      }
    }
  })

  it('aucune règle ne s’appuie sur une source partielle, notice seulement ou non lue pour un résultat quantitatif', () => {
    for (const r of RULE_REGISTRY.filter((x) => x.nature === 'quantitative')) {
      expect(r.coefficient).not.toBe('publie')
    }
    const pressure = RULE_REGISTRY.find((r) => r.id === 'INF-PRESSURE-01')
    expect(pressure?.status).toBe('informatif')
    expect(pressure?.implementedBy).toEqual([])
    const winter = RULE_REGISTRY.find((r) => r.id === 'UNS-WINTER-YARD-01')
    expect(winter?.status).toBe('non_pris_en_charge')
  })

  it('les coefficients ne sont « publiés » nulle part : aucun n’a été transcrit', () => {
    expect(RULE_REGISTRY.filter((r) => r.coefficient === 'publie')).toEqual([])
  })

  it('les conseils de praticien restent identifiés, sans coefficient publié ni nom de modèle', () => {
    for (const r of RULE_REGISTRY.filter((x) => x.category === 'C')) {
      expect(r.sources.length).toBeGreaterThan(0)
      for (const src of r.sources) expect(src.kind).toBe('praticien')
      expect(r.coefficient).not.toBe('publie')
      expect(r.title.toLowerCase()).not.toContain('modèle louis gagnon')
    }
  })

  it('Sullivan : région confirmée (Caroline du Sud, p. 226) et différences de dates conservées', () => {
    const sol = RULE_REGISTRY.find((r) => r.id === 'EXP-SOLUNAR-01')
    const sullivan = sol?.sources.find((x) => x.citation.startsWith('Sullivan'))
    expect(sol?.region).toContain('Caroline du Sud')
    expect(sullivan?.locator).toContain('p. 226')
    expect(sullivan?.locator).toContain('2009–2011')
    expect(sullivan?.locator).toContain('2010–2012')
  })

  it('Goethlich : deux dates distinctes conservées ; Webb : +20 % non significatif', () => {
    const goeth = RULE_REGISTRY.flatMap((r) => r.sources).find((x) =>
      x.citation.startsWith('Goethlich'),
    )
    expect(goeth?.citation).toContain('2 mai 2019')
    expect(goeth?.citation).toContain('2020')
    const rut = RULE_REGISTRY.find((r) => r.id === 'INF-RUT-01')
    expect(rut?.result).toContain('P = 0,07')
    expect(rut?.result).toContain('non significatif')
  })

  it('Hunsaker : la nullité porte sur les températures examinées, pas sur toute la météo', () => {
    const temp = RULE_REGISTRY.find((r) => r.id === 'INF-TEMP-01')
    expect(temp?.result).toContain('ne prouve pas que toute la météo a été testée')
  })

  it('la bibliographie couvre R01–R19 avec le niveau de lecture réel', () => {
    expect(BIBLIOGRAPHY.map((b) => b.ref)).toEqual(
      Array.from({ length: 19 }, (_, i) => `R${String(i + 1).padStart(2, '0')}`),
    )
    expect(BIBLIOGRAPHY.find((b) => b.ref === 'R06')?.verification).toBe('partiel')
    expect(BIBLIOGRAPHY.find((b) => b.ref === 'R19')?.verification).toBe('corps_recupere')
    expect(BIBLIOGRAPHY.find((b) => b.ref === 'R03')?.verification).toBe(
      'notice_seulement',
    )
    // Aucune référence n'est présentée comme lue intégralement.
    for (const b of BIBLIOGRAPHY) expect(b.missing.length).toBeGreaterThan(5)
  })
})
