/**
 * Two SEPARATE seasonal context bands. They are never merged, no daily peak or
 * curve is derived, and the date, latitude, temperature or moon never shift
 * them. The GPS position personalises weather and solar times, not this
 * calendar (the biological calendar is not calibrated locally at this stage).
 */
export type BandId = 'quebec' | 'wisconsin'

export interface SeasonalBand {
  id: BandId
  label: string
  /** Inclusive month/day bounds on the calendar year. */
  start: { month: number; day: number }
  end: { month: number; day: number }
  /** Plain wording of what the source says — kept close to the source. */
  statement: string
  origin: 'quebec' | 'external'
  caveat: string
  sourceId: 'QUEBEC_ESPECE' | 'HUNSAKER_2025'
}

export const SEASONAL_BANDS: readonly SeasonalBand[] = [
  {
    id: 'quebec',
    label: 'Québec — reproduction principalement en novembre et en décembre',
    start: { month: 11, day: 1 },
    end: { month: 12, day: 31 },
    statement:
      'Le gouvernement du Québec situe la reproduction principalement en novembre et en décembre. Ce sont des mois, pas des dates exactes : la bande ne dit rien d’un pic.',
    origin: 'quebec',
    caveat: 'Estimation régionale documentée — non calibrée pour votre territoire.',
    sourceId: 'QUEBEC_ESPECE',
  },
  {
    id: 'wisconsin',
    label: 'Wisconsin — déplacements maximaux des mâles (étude externe)',
    start: { month: 10, day: 23 },
    end: { month: 11, day: 12 },
    statement:
      'Étude externe (Hunsaker et coll. 2025) : le pic des déplacements de mâles munis de GPS se situe du 23 octobre au 12 novembre. Repère déduit des déplacements, pas des dates de conception.',
    origin: 'external',
    caveat: 'Étude externe — non calibrée pour le Québec.',
    sourceId: 'HUNSAKER_2025',
  },
]

/** Visible axis of the ribbon. */
export const AXIS_START = { month: 10, day: 15 }
export const AXIS_END = { month: 12, day: 31 }

export type BandPosition = 'avant' | 'dans' | 'apres'

function key(year: number, m: { month: number; day: number }): string {
  return `${year}-${String(m.month).padStart(2, '0')}-${String(m.day).padStart(2, '0')}`
}

function yearOf(dateKey: string): number {
  return Number(dateKey.slice(0, 4))
}

/** Where `dateKey` (YYYY-MM-DD) sits relative to one band of the same year. */
export function bandPosition(dateKey: string, band: SeasonalBand): BandPosition {
  const y = yearOf(dateKey)
  if (dateKey < key(y, band.start)) return 'avant'
  if (dateKey > key(y, band.end)) return 'apres'
  return 'dans'
}

export const POSITION_LABEL: Record<BandPosition, string> = {
  avant: 'avant la bande',
  dans: 'dans la bande',
  apres: 'après la bande',
}

function dayOfYear(year: number, m: { month: number; day: number }): number {
  return Math.round(Date.UTC(year, m.month - 1, m.day) / 86_400_000)
}

/** Fraction 0..1 of `m` along the visible axis (clamped). */
export function axisFraction(year: number, m: { month: number; day: number }): number {
  const a = dayOfYear(year, AXIS_START)
  const b = dayOfYear(year, AXIS_END)
  const v = dayOfYear(year, m)
  return Math.min(1, Math.max(0, (v - a) / (b - a)))
}

export function dateFraction(dateKey: string): number {
  const [y, mo, d] = dateKey.split('-').map(Number)
  return axisFraction(y, { month: mo, day: d })
}

/** Pedagogical note only — never an operational estimate of conception dates. */
export const GESTATION_NOTE =
  'À titre d’ordre de grandeur : une gestation moyenne d’environ 200 jours est cohérente avec des naissances de la fin mai au début juillet (Québec.ca). Ce n’est pas un calcul de dates de conception.'

export const GPS_NOTE =
  'Votre position GPS personnalise la météo et les heures solaires, pas le calendrier biologique, qui n’est pas calibré localement à ce stade.'
