/**
 * Display-only formatting of geographic coordinates. These helpers never
 * change a stored value: they only decide how a number is shown or copied.
 */

const NOT_A_NUMBER = 'indisponible'

/** `toFixed` without the confusing `-0.00000`. */
function fixed(value: number, decimals: number): string {
  const text = value.toFixed(decimals)
  return Number(text) === 0 ? (0).toFixed(decimals) : text
}

/** French display of a latitude: `46,81389° N` (decimal comma, N/S). */
export function formatLatitude(lat: number, decimals = 5): string {
  if (!Number.isFinite(lat)) return NOT_A_NUMBER
  return `${Math.abs(lat).toFixed(decimals).replace('.', ',')}° ${lat < 0 ? 'S' : 'N'}`
}

/** French display of a longitude: `71,20800° O` (decimal comma, E/O). */
export function formatLongitude(lng: number, decimals = 5): string {
  if (!Number.isFinite(lng)) return NOT_A_NUMBER
  return `${Math.abs(lng).toFixed(decimals).replace('.', ',')}° ${lng < 0 ? 'O' : 'E'}`
}

/** Universal paste format for map apps: signed decimal degrees with dot
 * decimals, `46.81389, -71.20800`. */
export function formatSignedDecimal(lat: number, lng: number, decimals = 5): string {
  return `${fixed(lat, decimals)}, ${fixed(lng, decimals)}`
}

/** One signed decimal value (`-71.20800`), for the share text. */
export function formatSignedValue(value: number, decimals = 5): string {
  return fixed(value, decimals)
}
