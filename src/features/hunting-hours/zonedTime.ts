/**
 * Wall-clock helpers for a PLACE's IANA time zone (never the phone's zone),
 * built on Intl only: daylight-saving changes and date changes come from the
 * platform's tz database, nothing is hard-coded.
 */

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
    formatters.set(timeZone, f)
  }
  return f
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatter(timeZone).format(new Date(0))
    return true
  } catch {
    return false
  }
}

interface Parts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function partsOf(date: Date, timeZone: string): Parts {
  const out: Record<string, number> = {}
  for (const p of formatter(timeZone).formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value)
  }
  return out as unknown as Parts
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** `YYYY-MM-DD` of `date` on the place's calendar. */
export function zonedDateKey(date: Date, timeZone: string): string {
  const p = partsOf(date, timeZone)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

/** `HH:mm` of `date` on the place's clock. */
export function zonedClock(date: Date, timeZone: string): string {
  const p = partsOf(date, timeZone)
  return `${pad(p.hour)}:${pad(p.minute)}`
}

/** Offset (minutes east of UTC) of `timeZone` at the instant `date`. */
export function zoneOffsetMinutes(date: Date, timeZone: string): number {
  const p = partsOf(date, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000)
}

/**
 * The instant at which the place's wall clock reads `dateKey hour:minute`.
 * Two passes settle the offset around a clock change. A wall time that does
 * not exist (spring-forward gap) resolves to the instant just after the gap.
 */
export function utcFromZoned(
  dateKey: string,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const [y, m, d] = dateKey.split('-').map(Number)
  const naive = Date.UTC(y, m - 1, d, hour, minute)
  let guess = naive - zoneOffsetMinutes(new Date(naive), timeZone) * 60_000
  guess = naive - zoneOffsetMinutes(new Date(guess), timeZone) * 60_000
  return new Date(guess)
}

/** `dateKey` shifted by `days` calendar days. */
export function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
