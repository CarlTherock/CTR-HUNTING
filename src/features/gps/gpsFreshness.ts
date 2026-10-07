/** How old a GPS fix is, in three buckets the UI can act on. */
export type GpsFreshness = 'recent' | 'old' | 'stale'

export const GPS_RECENT_MAX_MS = 15_000
export const GPS_OLD_MAX_MS = 120_000

/** `recent` (<= 15 s), `old` (<= 120 s) or `stale` (> 120 s). A timestamp in
 * the future (clock skew) counts as age 0; a non-finite one is `stale` — an
 * unknown age is never presented as fresh. */
export function gpsFreshness(nowMs: number, timestampMs: number): GpsFreshness {
  if (!Number.isFinite(nowMs) || !Number.isFinite(timestampMs)) return 'stale'
  const age = Math.max(0, nowMs - timestampMs)
  if (age <= GPS_RECENT_MAX_MS) return 'recent'
  if (age <= GPS_OLD_MAX_MS) return 'old'
  return 'stale'
}

/** Age of a fix in milliseconds (never negative). */
export function gpsAgeMs(nowMs: number, timestampMs: number): number {
  return Math.max(0, nowMs - timestampMs)
}

/** French relative age: `à l’instant`, `il y a 12 s`, `il y a 3 min`,
 * `il y a 2 h`. */
export function formatAge(ageMs: number): string {
  if (!Number.isFinite(ageMs)) return 'âge inconnu'
  const seconds = Math.floor(Math.max(0, ageMs) / 1000)
  if (seconds < 1) return 'à l’instant'
  if (seconds < 60) return `il y a ${seconds} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `il y a ${minutes} min`
  return `il y a ${Math.floor(minutes / 60)} h`
}
