import { describe, expect, it } from 'vitest'
import { chartDomain } from './HourlyChart'
import type { HourSlot } from '../engine'

const slot = (startIso: string, endIso: string) => ({ startIso, endIso }) as HourSlot

describe('axe temporel du graphique horaire', () => {
  it('ne fabrique pas un axe sans données', () => {
    expect(chartDomain([])).toBeNull()
  })

  it('conserve les 25 heures réelles du retour à l’heure normale', () => {
    const d = chartDomain([slot('2026-11-01T00:00:00-04:00', '2026-11-02T00:00:00-05:00')])
    expect(d).not.toBeNull()
    expect(d && (d.end - d.start) / 3_600_000).toBe(25)
  })

  it('conserve les 23 heures réelles du passage à l’heure avancée', () => {
    const d = chartDomain([slot('2026-03-08T00:00:00-05:00', '2026-03-09T00:00:00-04:00')])
    expect(d && (d.end - d.start) / 3_600_000).toBe(23)
  })

  it('utilise les bornes des données, pas un axe fixe de 24 h', () => {
    const d = chartDomain([slot('2026-11-07T10:00:00Z', '2026-11-07T11:00:00Z'), slot('2026-11-07T13:00:00Z', '2026-11-07T14:00:00Z')])
    expect(d && (d.end - d.start) / 3_600_000).toBe(4)
  })

  it('refuse une date invalide ou une durée nulle', () => {
    expect(chartDomain([slot('invalide', '2026-11-07T11:00:00Z')])).toBeNull()
    expect(chartDomain([slot('2026-11-07T11:00:00Z', '2026-11-07T11:00:00Z')])).toBeNull()
  })
})
