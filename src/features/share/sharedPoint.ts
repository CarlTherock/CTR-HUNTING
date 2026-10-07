import type { Coordinate } from '@/types'

/** Maximum length of a shared point's name, in characters. */
export const SHARED_NAME_MAX_LENGTH = 80
/** Name shown when a link carries none. */
export const DEFAULT_SHARED_NAME = 'Point partagé'
/** Longer query strings are not something this app ever generates. */
const MAX_SEARCH_LENGTH = 1000

export interface SharedPoint {
  coordinate: Coordinate
  name: string
}

export type ParsedSharedPoint =
  /** The URL carries no shared-point parameter at all. */
  | { kind: 'none' }
  | { kind: 'valid'; point: SharedPoint }
  /** The URL tries to share a point but the data is not acceptable. */
  | { kind: 'invalid' }

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g

/**
 * Plain-text name: control characters (incl. newlines) become spaces, angle
 * brackets are removed, whitespace is collapsed and the result is cut to 80
 * characters. The result is only ever rendered as React text (never HTML).
 */
export function sanitizeSharedName(raw: string): string {
  const cleaned = raw
    .replace(CONTROL_CHARS, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return Array.from(cleaned).slice(0, SHARED_NAME_MAX_LENGTH).join('').trim()
}

const NUMBER = String.raw`-?\d{1,3}(?:\.\d{1,15})?`
const POINT_PARAM = new RegExp(`^(${NUMBER}),(${NUMBER})$`)

/**
 * Strict parser for `?p=<lat>,<lng>&n=<name>`. Only `p` and `n` are looked
 * at; any other parameter is ignored. `p` must be exactly two plain decimal
 * numbers (no exponent, no spaces, no extra parts) inside the valid
 * WGS84 range, and appear once. A bad `p` makes the whole link invalid —
 * it is never "repaired".
 */
export function parseSharedPoint(search: string): ParsedSharedPoint {
  if (search.length > MAX_SEARCH_LENGTH) return { kind: 'invalid' }
  const params = new URLSearchParams(search)
  const hasP = params.has('p')
  const hasN = params.has('n')
  if (!hasP && !hasN) return { kind: 'none' }

  const ps = params.getAll('p')
  const ns = params.getAll('n')
  if (ps.length !== 1 || ns.length > 1) return { kind: 'invalid' }

  const match = POINT_PARAM.exec(ps[0])
  if (!match) return { kind: 'invalid' }
  const lat = Number(match[1])
  const lng = Number(match[2])
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return { kind: 'invalid' }
  }

  const name = sanitizeSharedName(ns[0] ?? '') || DEFAULT_SHARED_NAME
  return { kind: 'valid', point: { coordinate: { lat, lng }, name } }
}

/** Plain decimal (never an exponent), up to 7 decimals (~1 cm), no trailing zeros. */
function plainDecimal(value: number): string {
  const text = value
    .toFixed(7)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '')
  return text === '-0' ? '0' : text
}

/**
 * CTR Hunting link to a point: the ROOT of the app (`origin + BASE_URL`),
 * because the static host has no SPA fallback for deep paths. The startup
 * handler then moves to /map and removes the query.
 */
export function buildAppLink(
  origin: string,
  baseUrl: string,
  coordinate: Coordinate,
  name: string,
): string {
  const cleanName = sanitizeSharedName(name)
  const base = `${origin}${baseUrl}?p=${plainDecimal(coordinate.lat)},${plainDecimal(coordinate.lng)}`
  return cleanName ? `${base}&n=${encodeURIComponent(cleanName)}` : base
}
