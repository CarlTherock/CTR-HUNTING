import { getSunTimes } from '@/utils/temporal'
import type { Coordinate } from '@/types'
import {
  HUNTING_RULES,
  insideQuebecEnvelope,
  type HuntingRule,
  type HuntingRuleId,
} from './huntingRules'
import {
  addDays,
  isValidTimeZone,
  utcFromZoned,
  zonedClock,
  zonedDateKey,
} from './zonedTime'

/** Astronomical sun of one calendar day AT THE PLACE (its own time zone). */
export interface SunDay {
  dateKey: string
  timezone: string
  /** `null` at polar day/night: nothing is invented. */
  sunrise: Date | null
  sunset: Date | null
  sunriseClock: string | null
  sunsetClock: string | null
}

/**
 * Sunrise/sunset of `dateKey` on the place's calendar, offline (SunCalc). Each
 * instant is chosen among the neighbouring solar days so that it falls on the
 * requested LOCAL date — a place far from its zone's meridian, or a clock
 * change, never shifts the answer to another date.
 */
export function computeSunDay(input: {
  coordinate: Coordinate
  dateKey: string
  timezone: string
}): SunDay {
  const { coordinate, dateKey, timezone } = input
  if (!isValidTimeZone(timezone)) {
    return {
      dateKey,
      timezone,
      sunrise: null,
      sunset: null,
      sunriseClock: null,
      sunsetClock: null,
    }
  }
  const pick = (field: 'sunrise' | 'sunset'): Date | null => {
    for (const shift of [0, -1, 1]) {
      const noon = utcFromZoned(addDays(dateKey, shift), 12, 0, timezone)
      const iso = getSunTimes(noon, coordinate)[field]
      if (iso && zonedDateKey(new Date(iso), timezone) === dateKey) return new Date(iso)
    }
    return null
  }
  const sunrise = pick('sunrise')
  const sunset = pick('sunset')
  return {
    dateKey,
    timezone,
    sunrise,
    sunset,
    sunriseClock: sunrise ? zonedClock(sunrise, timezone) : null,
    sunsetClock: sunset ? zonedClock(sunset, timezone) : null,
  }
}

export type HuntingWindowState =
  /** The window is computed with the rule. */
  | 'computed'
  /** The person has not chosen a rule: the sun is shown, no window. */
  | 'no-rule'
  /** The chosen rule does not apply to this place: no window. */
  | 'outside-jurisdiction'
  /** The sun does not rise or set that day here: no window invented. */
  | 'sun-unavailable'

export interface HuntingWindow {
  state: HuntingWindowState
  rule: HuntingRule | null
  start: Date | null
  end: Date | null
  startClock: string | null
  endClock: string | null
  /** Why there is no window (shown as is). */
  reason: string | null
}

const EMPTY: Omit<HuntingWindow, 'state' | 'rule' | 'reason'> = {
  start: null,
  end: null,
  startClock: null,
  endClock: null,
}

/**
 * The window of a rule for a sun day. The rule is only applied when the person
 * chose it (`ruleId`) AND the place is not plainly outside its jurisdiction.
 */
export function computeHuntingWindow(
  sun: SunDay,
  coordinate: Coordinate,
  ruleId: HuntingRuleId | null,
): HuntingWindow {
  if (!ruleId) {
    return {
      ...EMPTY,
      state: 'no-rule',
      rule: null,
      reason:
        'Aucune règle de chasse choisie : seul le soleil est affiché, sans plage horaire.',
    }
  }
  const rule = HUNTING_RULES[ruleId]
  if (ruleId === 'quebec-general' && !insideQuebecEnvelope(coordinate)) {
    return {
      ...EMPTY,
      state: 'outside-jurisdiction',
      rule,
      reason:
        'Ce lieu est hors du Québec : la règle générale du Québec n’est pas appliquée. Aucune plage horaire n’est calculée.',
    }
  }
  if (!sun.sunrise || !sun.sunset) {
    return {
      ...EMPTY,
      state: 'sun-unavailable',
      rule,
      reason:
        'Le soleil ne se lève ou ne se couche pas à cette date et à ce lieu : aucune plage horaire n’est calculée.',
    }
  }
  const start = new Date(sun.sunrise.getTime() - rule.beforeSunriseMinutes * 60_000)
  const end = new Date(sun.sunset.getTime() + rule.afterSunsetMinutes * 60_000)
  return {
    state: 'computed',
    rule,
    start,
    end,
    startClock: zonedClock(start, sun.timezone),
    endClock: zonedClock(end, sun.timezone),
    reason: null,
  }
}

export type WindowPosition = 'before' | 'inside' | 'after'

/** Where `now` stands against a computed window (never « autorisé »). */
export function windowPosition(window: HuntingWindow, now: Date): WindowPosition | null {
  if (window.state !== 'computed' || !window.start || !window.end) return null
  if (now < window.start) return 'before'
  if (now > window.end) return 'after'
  return 'inside'
}
