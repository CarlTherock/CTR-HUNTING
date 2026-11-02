import { describe, expect, it } from 'vitest'
import { computeHuntingWindow, computeSunDay, windowPosition } from './huntingWindow'
import { QUEBEC_GENERAL_RULE, insideQuebecEnvelope } from './huntingRules'
import { utcFromZoned, zonedClock, zonedDateKey, zoneOffsetMinutes } from './zonedTime'

const QUEBEC = { lat: 46.8139, lng: -71.2082 }
const MONTREAL = { lat: 45.5017, lng: -73.5673 }
const TORONTO = { lat: 43.65, lng: -79.38 }
const TZ = 'America/Toronto'

function minutes(clock: string): number {
  const [h, m] = clock.split(':').map(Number)
  return h * 60 + m
}

/** Independent check: day length from the standard sunrise equation. */
function analyticDayLengthMinutes(latDeg: number, declinationDeg: number): number {
  const rad = Math.PI / 180
  const cosH =
    (Math.sin(-0.833 * rad) - Math.sin(latDeg * rad) * Math.sin(declinationDeg * rad)) /
    (Math.cos(latDeg * rad) * Math.cos(declinationDeg * rad))
  return ((2 * Math.acos(cosH) * 180) / Math.PI / 15) * 60
}

describe('zonedTime', () => {
  it('knows the offsets on both sides of the clock changes', () => {
    expect(zoneOffsetMinutes(new Date('2026-03-08T06:59:00Z'), TZ)).toBe(-300) // EST
    expect(zoneOffsetMinutes(new Date('2026-03-08T07:01:00Z'), TZ)).toBe(-240) // EDT
    expect(zoneOffsetMinutes(new Date('2026-11-01T05:59:00Z'), TZ)).toBe(-240)
    expect(zoneOffsetMinutes(new Date('2026-11-01T06:01:00Z'), TZ)).toBe(-300)
  })

  it('reads the date on the place calendar, not the UTC one', () => {
    // 2026-11-02 03:30 UTC is still 2 Nov? No: 22:30 on 1 Nov in Toronto (EST).
    expect(zonedDateKey(new Date('2026-11-02T03:30:00Z'), TZ)).toBe('2026-11-01')
    expect(zonedDateKey(new Date('2026-11-02T03:30:00Z'), 'Europe/Paris')).toBe(
      '2026-11-02',
    )
  })

  it('round-trips a wall time on each side of a change', () => {
    for (const [date, h] of [
      ['2026-03-08', 12],
      ['2026-03-07', 23],
      ['2026-11-01', 12],
    ] as const) {
      const instant = utcFromZoned(date, h, 15, TZ)
      expect(zonedDateKey(instant, TZ)).toBe(date)
      expect(zonedClock(instant, TZ)).toBe(`${String(h).padStart(2, '0')}:15`)
    }
  })
})

describe('computeSunDay', () => {
  it('matches the sunrise equation (day length) at both solstices', () => {
    const summer = computeSunDay({
      coordinate: QUEBEC,
      dateKey: '2026-06-21',
      timezone: TZ,
    })
    const len =
      minutes(summer.sunsetClock as string) - minutes(summer.sunriseClock as string)
    expect(Math.abs(len - analyticDayLengthMinutes(QUEBEC.lat, 23.44))).toBeLessThan(4)

    const winter = computeSunDay({
      coordinate: MONTREAL,
      dateKey: '2026-12-21',
      timezone: TZ,
    })
    const wlen =
      minutes(winter.sunsetClock as string) - minutes(winter.sunriseClock as string)
    expect(Math.abs(wlen - analyticDayLengthMinutes(MONTREAL.lat, -23.44))).toBeLessThan(
      4,
    )
  })

  it('centres solar noon where the longitude says (Québec is east of Toronto)', () => {
    const q = computeSunDay({ coordinate: QUEBEC, dateKey: '2026-11-02', timezone: TZ })
    const t = computeSunDay({ coordinate: TORONTO, dateKey: '2026-11-02', timezone: TZ })
    const noon = (d: typeof q) =>
      ((d.sunrise as Date).getTime() + (d.sunset as Date).getTime()) / 2
    // ~ (79.38 - 71.21) * 4 min = 33 min earlier in Québec.
    const diff = (noon(t) - noon(q)) / 60_000
    expect(diff).toBeGreaterThan(30)
    expect(diff).toBeLessThan(36)
  })

  it('follows the spring clock change: local sunrise jumps by ~1 h', () => {
    const before = computeSunDay({
      coordinate: TORONTO,
      dateKey: '2026-03-07',
      timezone: TZ,
    })
    const after = computeSunDay({
      coordinate: TORONTO,
      dateKey: '2026-03-08',
      timezone: TZ,
    })
    const jump =
      minutes(after.sunriseClock as string) - minutes(before.sunriseClock as string)
    expect(jump).toBeGreaterThanOrEqual(56)
    expect(jump).toBeLessThanOrEqual(60)
  })

  it('follows the autumn clock change: sunrise goes back by ~1 h', () => {
    const before = computeSunDay({
      coordinate: TORONTO,
      dateKey: '2026-10-31',
      timezone: TZ,
    })
    const after = computeSunDay({
      coordinate: TORONTO,
      dateKey: '2026-11-01',
      timezone: TZ,
    })
    const jump =
      minutes(before.sunriseClock as string) - minutes(after.sunriseClock as string)
    expect(jump).toBeGreaterThanOrEqual(58)
    expect(jump).toBeLessThanOrEqual(63)
  })

  it('works in other zones and never shifts the local date', () => {
    const paris = computeSunDay({
      coordinate: { lat: 48.8566, lng: 2.3522 },
      dateKey: '2026-07-01',
      timezone: 'Europe/Paris',
    })
    expect(paris.sunrise && zonedDateKey(paris.sunrise, 'Europe/Paris')).toBe(
      '2026-07-01',
    )
    expect(paris.sunset && zonedDateKey(paris.sunset, 'Europe/Paris')).toBe('2026-07-01')
    const vancouver = computeSunDay({
      coordinate: { lat: 49.2827, lng: -123.1207 },
      dateKey: '2026-06-21',
      timezone: 'America/Vancouver',
    })
    expect(vancouver.sunset && zonedDateKey(vancouver.sunset, 'America/Vancouver')).toBe(
      '2026-06-21',
    )
  })

  it('invents nothing at polar night or with an unknown zone', () => {
    const polarNight = computeSunDay({
      coordinate: { lat: 69.6492, lng: 18.9553 },
      dateKey: '2026-12-21',
      timezone: 'Europe/Oslo',
    })
    expect(polarNight.sunrise).toBeNull()
    expect(polarNight.sunset).toBeNull()
    const bad = computeSunDay({
      coordinate: QUEBEC,
      dateKey: '2026-11-02',
      timezone: 'Nope/Zone',
    })
    expect(bad.sunrise).toBeNull()
  })
})

describe('computeHuntingWindow', () => {
  const sun = computeSunDay({ coordinate: QUEBEC, dateKey: '2026-11-02', timezone: TZ })

  it('applies the general Québec rule: 30 min before sunrise to 30 min after sunset', () => {
    const w = computeHuntingWindow(sun, QUEBEC, 'quebec-general')
    expect(w.state).toBe('computed')
    expect(w.rule?.id).toBe('quebec-general')
    expect((sun.sunrise as Date).getTime() - (w.start as Date).getTime()).toBe(
      30 * 60_000,
    )
    expect((w.end as Date).getTime() - (sun.sunset as Date).getTime()).toBe(30 * 60_000)
    expect(minutes(w.startClock as string)).toBe(minutes(sun.sunriseClock as string) - 30)
  })

  it('shows only the sun when no rule is chosen — no invented window', () => {
    const w = computeHuntingWindow(sun, QUEBEC, null)
    expect(w.state).toBe('no-rule')
    expect(w.start).toBeNull()
    expect(w.end).toBeNull()
  })

  it('does not apply the Québec rule to another territory', () => {
    const paris = { lat: 48.8566, lng: 2.3522 }
    const parisSun = computeSunDay({
      coordinate: paris,
      dateKey: '2026-11-02',
      timezone: 'Europe/Paris',
    })
    const w = computeHuntingWindow(parisSun, paris, 'quebec-general')
    expect(w.state).toBe('outside-jurisdiction')
    expect(w.start).toBeNull()
    const alberta = { lat: 53.5, lng: -113.5 }
    expect(insideQuebecEnvelope(alberta)).toBe(false)
    expect(insideQuebecEnvelope(QUEBEC)).toBe(true)
  })

  it('gives no window when the sun does not rise or set', () => {
    const north = { lat: 69.6492, lng: 18.9553 }
    const polar = computeSunDay({
      coordinate: north,
      dateKey: '2026-12-21',
      timezone: 'Europe/Oslo',
    })
    // Even for a rule-supported place the polar case never invents a window.
    const w = computeHuntingWindow(polar, QUEBEC, 'quebec-general')
    expect(w.state).toBe('sun-unavailable')
    expect(w.start).toBeNull()
  })

  it('says « inside the calculated window », never « authorized »', () => {
    const w = computeHuntingWindow(sun, QUEBEC, 'quebec-general')
    const mid = new Date(((w.start as Date).getTime() + (w.end as Date).getTime()) / 2)
    expect(windowPosition(w, mid)).toBe('inside')
    expect(windowPosition(w, new Date((w.start as Date).getTime() - 60_000))).toBe(
      'before',
    )
    expect(windowPosition(w, new Date((w.end as Date).getTime() + 60_000))).toBe('after')
    expect(windowPosition(computeHuntingWindow(sun, QUEBEC, null), mid)).toBeNull()
  })

  it('keeps the source, the verification date and the explanation with the rule', () => {
    expect(QUEBEC_GENERAL_RULE.source.url).toContain('quebec.ca')
    expect(QUEBEC_GENERAL_RULE.source.verifiedOn).toBe('2026-11-02')
    expect(QUEBEC_GENERAL_RULE.summary).toMatch(/30 minutes avant le lever/)
    expect(QUEBEC_GENERAL_RULE.exceptions.join(' ')).toMatch(/Dindon/)
    expect(QUEBEC_GENERAL_RULE.reminders.join(' ')).toMatch(/oiseaux migrateurs/i)
  })
})
