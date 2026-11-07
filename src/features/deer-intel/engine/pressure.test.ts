import { describe, expect, it } from 'vitest'
import type { PointForecast, PointHourly } from '@/types'
import { pressureChange, pressureSeries } from './pressure'

const hour = (time: string, hpa: number | null): PointHourly =>
  ({ time, surfacePressureHpa: hpa }) as PointHourly
const fc = (hourly: PointHourly[]): PointForecast => ({
  timezone: 'America/Toronto',
  hourly,
  daily: [],
})
const TZ = 'America/Toronto'
const NOW = '2026-11-06T12:00:00.000Z'

describe('variation de pression', () => {
  const series = pressureSeries(
    fc([
      hour('2026-11-06T06:00', 1010),
      hour('2026-11-06T07:00', 1011),
      hour('2026-11-06T08:00', 1012),
      hour('2026-11-06T09:00', 1013),
      hour('2026-11-06T10:00', 1014),
    ]),
    TZ,
  )
  const at = (h: number) => series[h].iso

  it('1010 → 1014 en 4 h = +4 hPa et +1 hPa/h', () => {
    const c = pressureChange(series, at(4), 4, '2026-11-07T00:00:00Z')
    expect(c.state).toBe('ok')
    expect(c.deltaHpa).toBe(4)
    expect(c.slopeHpaPerHour).toBe(1)
    expect(c.elapsedHours).toBe(4)
    expect(c.nature).toBe('passee')
  })

  it('l’inverse = −4 hPa et −1 hPa/h', () => {
    const rev = pressureSeries(
      fc([
        hour('2026-11-06T06:00', 1014),
        hour('2026-11-06T07:00', 1013),
        hour('2026-11-06T08:00', 1012),
        hour('2026-11-06T09:00', 1011),
        hour('2026-11-06T10:00', 1010),
      ]),
      TZ,
    )
    const c = pressureChange(rev, rev[4].iso, 4, '2026-11-07T00:00:00Z')
    expect([c.deltaHpa, c.slopeHpaPerHour]).toEqual([-4, -1])
  })

  it('borne absente : indisponible, jamais 0', () => {
    const gap = pressureSeries(
      fc([hour('2026-11-06T06:00', null), hour('2026-11-06T10:00', 1014)]),
      TZ,
    )
    const c = pressureChange(gap, gap[1].iso, 4, NOW)
    expect(c.state).toBe('indisponible')
    expect(c.deltaHpa).toBeNull()
    expect(c.reason).toContain('début')
    const none = pressureChange(series, series[1].iso, 4, NOW)
    expect(none.state).toBe('indisponible')
  })

  it('distingue tendance passée, variation prévue et mixte', () => {
    const t0 = Date.parse(series[0].iso)
    const now = new Date(t0 + 2 * 3_600_000).toISOString()
    expect(pressureChange(series, at(4), 4, now).nature).toBe('mixte')
    expect(pressureChange(series, at(4), 4, new Date(t0 - 1).toISOString()).nature).toBe(
      'prevue',
    )
  })

  it('heure d’été : la fenêtre est une durée écoulée (passage 2026-03-08 à Toronto)', () => {
    // 01:00 → 04:00 locales couvrent 2 h écoulées seulement (02:00 n'existe pas).
    const dst = pressureSeries(
      fc([
        hour('2026-03-08T01:00', 1000),
        hour('2026-03-08T04:00', 1003),
        hour('2026-03-08T05:00', 1004),
      ]),
      TZ,
    )
    expect(Date.parse(dst[1].iso) - Date.parse(dst[0].iso)).toBe(2 * 3_600_000)
    const c = pressureChange(dst, dst[2].iso, 4, '2027-01-01T00:00:00Z')
    expect(c.state).toBe('indisponible') // 05:00 − 4 h écoulées = 00:00, absent : pas de substitution murale
  })

  it('le type de pression est de surface', async () => {
    const { PRESSURE_TYPE } = await import('./pressure')
    expect(PRESSURE_TYPE).toBe('surface')
  })
})
