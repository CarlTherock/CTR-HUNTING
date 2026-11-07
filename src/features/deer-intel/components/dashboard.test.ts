import { describe, expect, it } from 'vitest'
import type { DayAnalysis, HuntWindow } from '../engine'
import { durationLabel, pickBestSlot, weatherDrivesRanking } from './dashboard'

const H = 3_600_000
const T0 = Date.parse('2026-11-06T05:00:00.000Z')
const iso = (h: number) => new Date(T0 + h * H).toISOString()
const win = (a: number, b: number): HuntWindow => ({
  startIso: iso(a),
  endIso: iso(b),
  startClock: `${a}:00`,
  endClock: `${b}:00`,
  meanIndex: 60,
  maxIndex: 70,
  hours: b - a,
  comparable: true,
})
const day = (windows: HuntWindow[]) =>
  ({
    slots: Array.from({ length: 24 }, (_, i) => ({
      startIso: iso(i),
      endIso: iso(i + 1),
      conditions: null,
    })),
    windows,
  }) as unknown as DayAnalysis

describe('pickBestSlot', () => {
  const d = day([win(1, 3), win(11, 13), win(15, 17)])
  it('un autre jour : le premier du classement', () => {
    const r = pickBestSlot(d, T0 + 40 * H)
    expect(r?.main.startIso).toBe(iso(1))
    expect(r?.status).toBe('a_venir')
    expect(r?.earlierBest).toBeNull()
  })
  it('aujourd’hui : le meilleur créneau passé est signalé, le meilleur restant est proposé', () => {
    const r = pickBestSlot(d, T0 + 8 * H)
    expect(r?.main.startIso).toBe(iso(11))
    expect(r?.earlierBest?.startIso).toBe(iso(1))
    expect(r?.alternative?.startIso).toBe(iso(15))
  })
  it('créneau en cours', () => {
    expect(pickBestSlot(d, T0 + 12 * H)?.status).toBe('en_cours')
  })
  it('tout est passé : le dit, sans inventer', () => {
    const r = pickBestSlot(d, T0 + 20 * H)
    expect(r?.status).toBe('passe')
  })
  it('aucun créneau : null', () => {
    expect(pickBestSlot(day([]), T0)).toBeNull()
  })
})

describe('affichage', () => {
  it('durée lisible', () => {
    expect(durationLabel(win(1, 3))).toBe('2 h')
  })
  it('sans condition évaluée, la météo ne pilote pas le classement', () => {
    expect(weatherDrivesRanking(day([]))).toBe(false)
  })
})
