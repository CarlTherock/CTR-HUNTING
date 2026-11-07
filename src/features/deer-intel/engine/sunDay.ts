import * as SunCalc from 'suncalc'
import type { Coordinate } from '@/types'
import {
  addDays,
  isValidTimeZone,
  utcFromZoned,
  zonedDateKey,
} from '@/features/hunting-hours/zonedTime'
import type { SunInfo } from './types'

/**
 * Soleil d'un jour du calendrier LOCAL du lieu (fuseau propre) : lever, coucher et
 * crépuscules civils (soleil à −6°), hors ligne (SunCalc). Chaque instant est choisi parmi
 * les jours solaires voisins pour tomber sur la date locale demandée.
 */
export function solarDay(
  coordinate: Coordinate,
  dateKey: string,
  timezone: string,
): SunInfo {
  const none: SunInfo = {
    sunrise: null,
    sunset: null,
    dawn: null,
    dusk: null,
    dayLengthMinutes: null,
  }
  if (!isValidTimeZone(timezone)) return none
  const pick = (field: 'sunrise' | 'sunset' | 'dawn' | 'dusk'): Date | null => {
    for (const shift of [0, -1, 1]) {
      const noon = utcFromZoned(addDays(dateKey, shift), 12, 0, timezone)
      const t = SunCalc.getTimes(noon, coordinate.lat, coordinate.lng)[field]
      if (
        t instanceof Date &&
        !Number.isNaN(t.getTime()) &&
        zonedDateKey(t, timezone) === dateKey
      ) {
        return t
      }
    }
    return null
  }
  const sunrise = pick('sunrise')
  const sunset = pick('sunset')
  return {
    sunrise,
    sunset,
    dawn: pick('dawn'),
    dusk: pick('dusk'),
    dayLengthMinutes:
      sunrise && sunset ? (sunset.getTime() - sunrise.getTime()) / 60_000 : null,
  }
}
