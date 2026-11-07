import type { SunInfo } from './types'

/** Règles exécutées (comparées au registre par un test). */
export const ACTIVITY_RULE_IDS = ['ACT-CREPUSCULAR-01', 'ACT-BASELINE-01'] as const

/** Choix de conception (heuristiques, voir le registre) — aucun n'est un coefficient publié. */
export const ACTIVITY = {
  nightBase: 25,
  dayBase: 18,
  peakHeight: 60,
  /** Largeur (σ, minutes) des deux pics. */
  sigmaMinutes: 70,
  /** Centre du pic du matin : un peu après le lever. */
  morningOffsetMinutes: 20,
  /** Centre du pic du soir : un peu avant le coucher. */
  eveningOffsetMinutes: -10,
} as const

function gauss(distanceMinutes: number, sigma: number): number {
  return Math.exp(-(distanceMinutes * distanceMinutes) / (2 * sigma * sigma))
}

/**
 * Activité biologique de référence (0–100) à un instant : deux pics crépusculaires ancrés sur
 * le lever et le coucher LOCAUX (jamais 6 h / 18 h), au-dessus d'un plancher non nul la nuit
 * et le jour. Une seule fonction du soleil : l'aube n'est comptée qu'une fois. `null` si le
 * soleil ne se lève pas ou ne se couche pas (aucune valeur inventée).
 */
export function referenceActivity(at: Date, sun: SunInfo): number | null {
  if (!sun.sunrise || !sun.sunset) return null
  const t = at.getTime()
  // Raccord progressif (±30 min) entre le plancher de nuit et celui de jour.
  const smooth = (x: number) => {
    const c = Math.min(1, Math.max(0, x))
    return c * c * (3 - 2 * c)
  }
  const ramp = (at: Date) => smooth((t - (at.getTime() - 30 * 60_000)) / (60 * 60_000))
  const dayFactor = Math.max(0, ramp(sun.sunrise) - ramp(sun.sunset))
  const base = ACTIVITY.nightBase + (ACTIVITY.dayBase - ACTIVITY.nightBase) * dayFactor
  const dm = (ref: Date, offsetMin: number) =>
    (t - (ref.getTime() + offsetMin * 60_000)) / 60_000
  const morning = gauss(
    dm(sun.sunrise, ACTIVITY.morningOffsetMinutes),
    ACTIVITY.sigmaMinutes,
  )
  const evening = gauss(
    dm(sun.sunset, ACTIVITY.eveningOffsetMinutes),
    ACTIVITY.sigmaMinutes,
  )
  const value = base + ACTIVITY.peakHeight * Math.max(morning, evening)
  return Math.min(100, Math.max(0, value))
}
