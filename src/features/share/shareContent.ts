import type { Coordinate } from '@/types'
import type { SharePayload } from '@/services/share'
import {
  formatLatitude,
  formatLongitude,
  formatSignedValue,
} from '@/utils/coordinateFormat'
import { buildAppLink, sanitizeSharedName } from './sharedPoint'

/** The sentence that makes explicit that a position share is a photo, not tracking. */
export const SNAPSHOT_SENTENCE = 'Instantané de ma position — pas un suivi en direct.'
export const POSITION_SHARE_TITLE = 'Ma position (instantané)'

/** Official Google Maps URLs API: `search` with a `query` of `lat,lng`.
 * https://developers.google.com/maps/documentation/urls/get-started */
export function buildMapLink(coordinate: Coordinate): string {
  const url = new URL('https://www.google.com/maps/search/')
  url.searchParams.set('api', '1')
  // URLSearchParams encodes the comma as %2C; the value itself stays signed.
  url.searchParams.set('query', `${coordinate.lat},${coordinate.lng}`)
  return url.toString()
}

function coordinateLines(c: Coordinate): string[] {
  return [
    `Latitude : ${formatLatitude(c.lat)} (${formatSignedValue(c.lat)})`,
    `Longitude : ${formatLongitude(c.lng)} (${formatSignedValue(c.lng)})`,
  ]
}

export interface WaypointShareInput {
  name: string
  coordinate: Coordinate
}

export interface WaypointShareOptions {
  /** `location.origin` — when given (with `baseUrl`) a CTR Hunting link is added. */
  origin?: string
  /** Vite `BASE_URL`. */
  baseUrl?: string
}

/**
 * Share content of ONE saved waypoint: its name and position, a map link and
 * optionally a CTR Hunting link. Deliberately reads nothing else from the
 * waypoint (no notes, photos, category, colour, wind, history) and knows
 * nothing about the user's own position or other waypoints.
 */
export function buildWaypointShare(
  waypoint: WaypointShareInput,
  options: WaypointShareOptions = {},
): SharePayload {
  const name = sanitizeSharedName(waypoint.name) || 'Point de repère'
  const coordinate: Coordinate = {
    lat: waypoint.coordinate.lat,
    lng: waypoint.coordinate.lng,
  }
  const mapLink = buildMapLink(coordinate)
  const lines = [`Point : ${name}`, ...coordinateLines(coordinate)]
  if (options.origin !== undefined && options.baseUrl !== undefined) {
    lines.push(
      `CTR Hunting : ${buildAppLink(options.origin, options.baseUrl, coordinate, name)}`,
    )
  }
  return { title: name, text: lines.join('\n'), url: mapLink }
}

export interface PositionShareInput {
  coordinate: Coordinate
  accuracyMeters?: number
  /** Time of the fix (epoch ms). */
  timestampMs: number
}

function formatFixTime(timestampMs: number, timeZone?: string): string {
  return new Intl.DateTimeFormat('fr-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(timestampMs))
}

/**
 * One-off SNAPSHOT of the user's position: coordinates, accuracy, time of
 * the fix, a map link and the explicit "not live tracking" sentence. Built
 * only when the user asks to share it.
 */
export function buildPositionShare(
  position: PositionShareInput,
  options: { timeZone?: string } = {},
): SharePayload {
  const coordinate: Coordinate = {
    lat: position.coordinate.lat,
    lng: position.coordinate.lng,
  }
  const accuracy =
    typeof position.accuracyMeters === 'number' &&
    Number.isFinite(position.accuracyMeters)
      ? `±${Math.round(position.accuracyMeters)} m`
      : 'inconnue'
  const lines = [
    POSITION_SHARE_TITLE,
    ...coordinateLines(coordinate),
    `Précision : ${accuracy}`,
    `Relevé : ${formatFixTime(position.timestampMs, options.timeZone)}`,
    SNAPSHOT_SENTENCE,
  ]
  return {
    title: POSITION_SHARE_TITLE,
    text: lines.join('\n'),
    url: buildMapLink(coordinate),
  }
}

/** Text put on the clipboard by the "Copier le texte / lien" fallback. */
export function payloadToClipboardText(payload: SharePayload): string {
  return `${payload.text}\n${payload.url}`
}
