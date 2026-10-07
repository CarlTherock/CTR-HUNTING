/** `1:23` (m:ss) or `1:02:03` (h:mm:ss) once past an hour. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`
}

/** Meters below 1 km, kilometers (2 decimals, French decimal comma) at or above. */
export function formatDistanceMeters(meters: number): string {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(2).replace('.', ',')} km`
    : `${Math.round(meters)} m`
}

/** Bytes below 1 KB, KB below 1 MB (rounded), MB at or above (1 decimal). */
export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} Mo`
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} Ko`
  return `${bytes} o`
}

/** Narrow no-break space: French thousands separator (never breaks a number). */
export const THIN_NBSP = ' '
/** No-break space between a number and its unit. */
export const NBSP = ' '

/**
 * French number: decimal comma, narrow no-break space every 3 digits of the
 * integer part (`12 345,6`). Rounds half away from zero like `toFixed`, never
 * yields `-0`, and returns `—` for NaN/Infinity instead of printing them.
 */
export function formatNumberFr(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return '—'
  const fixed = Math.abs(value).toFixed(decimals)
  const [integer, fraction] = fixed.split('.')
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, THIN_NBSP)
  const isZero = Number(fixed) === 0
  const sign = value < 0 && !isZero ? '-' : ''
  return `${sign}${grouped}${fraction ? `,${fraction}` : ''}`
}

/** `12 345,6 m` — metres with one decimal (measure tools need ~10 cm). */
export function formatMetersFr(meters: number, decimals = 1): string {
  return `${formatNumberFr(meters, decimals)}${NBSP}m`
}

/** `12,35 km` */
export function formatKilometersFr(meters: number, decimals = 2): string {
  return `${formatNumberFr(meters / 1000, decimals)}${NBSP}km`
}

/** `3,45 ha` */
export function formatHectaresFr(squareMeters: number, decimals = 2): string {
  return `${formatNumberFr(squareMeters / 10_000, decimals)}${NBSP}ha`
}

/** `34 500 m²` (whole square metres) */
export function formatSquareMetersFr(squareMeters: number): string {
  return `${formatNumberFr(squareMeters, 0)}${NBSP}m²`
}

/** `8,52 acres` (`1,00 acre`: French keeps the singular below 2). */
export function formatAcresFr(squareMeters: number, decimals = 2): string {
  const acres = squareMeters / 4046.8564224
  const unit = Math.abs(acres) < 2 ? 'acre' : 'acres'
  return `${formatNumberFr(acres, decimals)}${NBSP}${unit}`
}
