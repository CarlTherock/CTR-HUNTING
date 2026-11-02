/** « indisponible » is shown for an absent value — never 0. */
export function num(value: number | null | undefined, unit: string, digits = 0): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? 'indisponible'
    : `${value.toFixed(digits)} ${unit}`.trim()
}

const COMPASS = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSO',
  'SO',
  'OSO',
  'O',
  'ONO',
  'NO',
  'NNO',
]

/** « NO (315°) » — the direction the wind comes FROM, or « indisponible ». */
export function windFrom(degrees: number | null | undefined): string {
  if (degrees === null || degrees === undefined || !Number.isFinite(degrees)) {
    return 'direction indisponible'
  }
  const d = ((degrees % 360) + 360) % 360
  return `du ${COMPASS[Math.round(d / 22.5) % 16]} (${Math.round(d)}°)`
}

/** Weekday + day for a day chip (« lun. 2 »). */
export function weekdayShort(dateKey: string): string {
  return new Intl.DateTimeFormat('fr-CA', {
    weekday: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${dateKey}T00:00:00Z`))
}

/** « lundi 2 novembre » from a `YYYY-MM-DD` key (no time-zone shift). */
export function longDate(dateKey: string): string {
  return new Intl.DateTimeFormat('fr-CA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${dateKey}T00:00:00Z`))
}
