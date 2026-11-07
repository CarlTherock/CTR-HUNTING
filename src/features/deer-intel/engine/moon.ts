import * as SunCalc from 'suncalc'
import type { Coordinate } from '@/types'
import { addDays, utcFromZoned } from '@/features/hunting-hours/zonedTime'
import { moonPhaseName } from '@/utils/temporal'
import type { MoonInfo } from './types'

const STEP_MS = 10 * 60_000

function altitude(t: number, c: Coordinate): number {
  return SunCalc.getMoonPosition(new Date(t), c.lat, c.lng).altitude
}

/** sin(azimut) : change de signe au méridien (haut ou bas), sans le saut de ±π. */
function sinAzimuth(t: number, c: Coordinate): number {
  // SunCalc 2.x exprime l'azimut en DEGRÉS (et non en radians comme SunCalc 1.x).
  return Math.sin(
    (SunCalc.getMoonPosition(new Date(t), c.lat, c.lng).azimuth * Math.PI) / 180,
  )
}

function bisect(f: (t: number) => number, lo: number, hi: number): number {
  let a = lo
  let b = hi
  const fa = f(a)
  for (let i = 0; i < 14; i++) {
    const m = (a + b) / 2
    const fm = f(m)
    if (Math.sign(fm) === Math.sign(fa)) a = m
    else b = m
  }
  return (a + b) / 2
}

/**
 * Événements lunaires d'un jour LOCAL : lever, coucher, passage au méridien (supérieur) et
 * passage inférieur, par recherche de croisements (altitude = 0 ; azimut au méridien). Les
 * formules de SunCalc sont à basse précision : compter sur quelques minutes d'écart, pas sur
 * la seconde. Le passage inférieur n'est PAS « supérieur + 12 h » ; un événement absent ce
 * jour-là (le jour lunaire dure ~24 h 50) reste `null`.
 */
export function moonDay(
  coordinate: Coordinate,
  dateKey: string,
  timezone: string,
): MoonInfo {
  const start = utcFromZoned(dateKey, 0, 0, timezone).getTime()
  const end = utcFromZoned(addDays(dateKey, 1), 0, 0, timezone).getTime()
  const noon = utcFromZoned(dateKey, 12, 0, timezone)

  let rise: number | null = null
  let set: number | null = null
  let upper: number | null = null
  let lower: number | null = null
  let anyUp = false
  let anyDown = false

  let prevT = start
  let prevAlt = altitude(prevT, coordinate)
  let prevSin = sinAzimuth(prevT, coordinate)
  if (prevAlt > 0) anyUp = true
  else anyDown = true
  for (let t = start + STEP_MS; t <= end; t += STEP_MS) {
    const alt = altitude(t, coordinate)
    const sin = sinAzimuth(t, coordinate)
    if (alt > 0) anyUp = true
    else anyDown = true
    if (prevAlt <= 0 && alt > 0 && rise === null) {
      rise = bisect((x) => altitude(x, coordinate), prevT, t)
    } else if (prevAlt > 0 && alt <= 0 && set === null) {
      set = bisect((x) => altitude(x, coordinate), prevT, t)
    }
    if (
      Math.sign(prevSin) !== Math.sign(sin) &&
      Math.abs(prevSin) < 0.5 &&
      Math.abs(sin) < 0.5
    ) {
      const x = bisect((u) => sinAzimuth(u, coordinate), prevT, t)
      // Haut ou bas : l'altitude au croisement est plus grande qu'à ±6 h pour le passage supérieur.
      const here = altitude(x, coordinate)
      const isUpper =
        here > altitude(x - 6 * 3_600_000, coordinate) &&
        here > altitude(x + 6 * 3_600_000, coordinate)
      if (isUpper && upper === null) upper = x
      if (!isUpper && lower === null) lower = x
    }
    prevT = t
    prevAlt = alt
    prevSin = sin
  }

  const illum = SunCalc.getMoonIllumination(noon)
  const d = (ms: number | null) => (ms === null ? null : new Date(ms))
  return {
    illuminationFraction: illum.fraction,
    phaseName: moonPhaseName(illum.phase),
    waxing: illum.phase < 0.5,
    rise: d(rise),
    set: d(set),
    upperTransit: d(upper),
    lowerTransit: d(lower),
    visibility: anyUp && anyDown ? 'normal' : anyUp ? 'always_up' : 'always_down',
  }
}

/** La lune est-elle au-dessus de l'horizon à cet instant ? (indépendant de la fraction éclairée et des nuages) */
export function moonIsUp(at: Date, coordinate: Coordinate): boolean {
  return altitude(at.getTime(), coordinate) > 0
}
