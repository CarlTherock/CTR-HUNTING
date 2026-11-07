import { describe, expect, it } from 'vitest'
import { classifyTerritory, resolveTimeZone } from './territory'

describe('territoire', () => {
  it('points de démonstration du Québec continental', () => {
    expect(classifyTerritory(46.8, -71.2).state).toMatch(/quebec|incertain/) // proche du fleuve
    expect(classifyTerritory(45.6, -72.0).state).toBe('quebec')
    expect(classifyTerritory(45.4, -71.9).state).toBe('quebec')
  })
  it('Anticosti est un contexte distinct', () => {
    expect(classifyTerritory(49.5, -63.0).state).toBe('anticosti')
  })
  it('Îles-de-la-Madeleine : aucun repère documenté', () => {
    expect(classifyTerritory(47.4, -61.8).state).toMatch(/madeleine|incertain/)
  })
  it('hors territoire : Ontario, Nouvelle-Angleterre, Floride', () => {
    expect(classifyTerritory(44.0, -80.5).state).toBe('hors_territoire') // sud de l'Ontario
    expect(classifyTerritory(43.5, -72.5).state).toBe('hors_territoire') // Vermont
    expect(classifyTerritory(28.0, -81.0).state).toBe('hors_territoire')
  })
  it('un point proche d’une frontière est incertain, jamais classé en silence', () => {
    const r = classifyTerritory(45.05, -72.5) // ~ frontière Québec/Vermont
    expect(r.state).toBe('incertain')
    expect(r.boundaryKm).toBeLessThanOrEqual(15)
  })
  it('coordonnées invalides', () => {
    expect(classifyTerritory(Number.NaN, -72).state).toBe('hors_territoire')
    expect(classifyTerritory(95, -72).state).toBe('hors_territoire')
  })
  it('fuseau sans météo : établi au Québec de l’ouest, non établi ailleurs, jamais le téléphone', () => {
    expect(resolveTimeZone(45.6, -72.0).timeZone).toBe('America/Toronto')
    expect(resolveTimeZone(44.0, -80.5).timeZone).toBeNull()
    expect(resolveTimeZone(50.2, -61.0).timeZone).toBeNull()
  })
})
