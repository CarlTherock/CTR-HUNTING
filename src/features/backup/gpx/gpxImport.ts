import type { Coordinate, TrackPoint, WaypointCategory, WaypointColor } from '@/types'
import { totalDistanceMeters } from '@/utils/geo'
import { isValidLatLng } from '../engine/validate'
import {
  CTR_NS,
  GPX_MAX_BYTES,
  GPX_MAX_NAME_LENGTH,
  GPX_MAX_POINTS,
  GPX_MAX_TEXT_LENGTH,
  GPX_MAX_WAYPOINTS,
  SAFE_ID_PATTERN,
  WAYPOINT_CATEGORIES,
  WAYPOINT_COLORS,
  categoryFromSymbol,
} from './gpxFormat'

/**
 * GPX reader. Security stance, in one place:
 *
 *  - the file is parsed with `DOMParser` as `application/xml` — never as
 *    HTML — and every value is read with `textContent` / `getAttribute`;
 *  - nothing from the file is ever put in `innerHTML`: it ends up in the
 *    database as plain strings and is later shown through React, which
 *    escapes it;
 *  - DOCTYPE / ENTITY declarations are refused outright (GPX never needs
 *    them; they are how « billion laughs » expansion attacks work);
 *  - size and point-count limits are checked before any heavy work;
 *  - every coordinate is validated (finite, lat ±90, lng ±180) and invalid
 *    points are counted and reported, never silently kept.
 *
 * Pure: no database access here (see `gpxService.ts`).
 */
export interface ParsedGpxWaypoint {
  /** Id found in the app's own extension, when it is safe to reuse. */
  id?: string
  name: string
  notes?: string
  coordinate: Coordinate
  category: WaypointCategory
  color?: WaypointColor
  territoryId?: string
  optimalWindDirections?: number[]
  createdAt: string
  updatedAt: string
  /** The file gave no usable time: `createdAt` is the import time. */
  timeMissing: boolean
}

export interface ParsedGpxTrack {
  id?: string
  name: string
  notes?: string
  points: TrackPoint[]
  startedAt: string
  endedAt?: string
  distanceMeters: number
  territoryId?: string
  /** Points whose time was missing (they got the track start / import time). */
  pointsWithoutTime: number
}

export interface GpxIssue {
  level: 'info' | 'warning'
  message: string
}

export interface GpxParseResult {
  waypoints: ParsedGpxWaypoint[]
  tracks: ParsedGpxTrack[]
  issues: GpxIssue[]
  stats: {
    waypointsFound: number
    waypointsInvalid: number
    tracksFound: number
    tracksSkipped: number
    pointsFound: number
    pointsInvalid: number
    routesIgnored: number
  }
}

export type GpxErrorCode = 'too-large' | 'not-xml' | 'not-gpx' | 'unsafe' | 'limits'

/** The whole file is refused (nothing to import). */
export class GpxImportError extends Error {
  readonly code: GpxErrorCode
  constructor(code: GpxErrorCode, message: string) {
    super(message)
    this.name = 'GpxImportError'
    this.code = code
  }
}

const NUMBER_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/

export function parseStrictNumber(text: string | null | undefined): number | null {
  if (text === null || text === undefined) return null
  const trimmed = text.trim()
  if (!NUMBER_PATTERN.test(trimmed)) return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

function parseTime(text: string | undefined | null): string | null {
  if (!text) return null
  const trimmed = text.trim()
  if (!/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) return null
  const t = Date.parse(trimmed)
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}

/** Direct element children by local name. Walks siblings instead of using
 * `element.children`, whose indexed access is slow on huge nodes in some DOMs. */
function childElements(element: Element): Element[] {
  const out: Element[] = []
  for (let c = element.firstElementChild; c; c = c.nextElementSibling) out.push(c)
  return out
}

function children(element: Element, localName: string): Element[] {
  return childElements(element).filter((child) => child.localName === localName)
}

function childText(element: Element, localName: string): string | undefined {
  const child = children(element, localName)[0]
  const text = child?.textContent
  return text === null || text === undefined || text === '' ? undefined : text
}

function ctrElement(element: Element, localName: string): Element | undefined {
  for (const extensions of children(element, 'extensions')) {
    for (const child of childElements(extensions)) {
      if (child.namespaceURI === CTR_NS && child.localName === localName) return child
    }
  }
  return undefined
}

function limitText(
  text: string | undefined,
  max: number,
  note: (message: string) => void,
  what: string,
): string | undefined {
  if (text === undefined) return undefined
  if (text.length <= max) return text
  note(`${what} tronqué à ${max} caractères.`)
  return text.slice(0, max)
}

function limitsMessage(): string {
  return `Ce fichier dépasse les limites acceptées (${GPX_MAX_WAYPOINTS.toLocaleString('fr-CA')} points de repère, ${GPX_MAX_POINTS.toLocaleString('fr-CA')} points de trace).`
}

function countOccurrences(text: string, needle: string): number {
  let count = 0
  let from = 0
  for (;;) {
    const at = text.indexOf(needle, from)
    if (at === -1) return count
    count++
    from = at + needle.length
  }
}

function countByLocalName(root: Element, localName: string): number {
  return root.getElementsByTagNameNS('*', localName).length
}

export interface ParseGpxOptions {
  now?: Date
  maxBytes?: number
}

export function parseGpx(text: string, options: ParseGpxOptions = {}): GpxParseResult {
  const nowIso = (options.now ?? new Date()).toISOString()
  const maxBytes = options.maxBytes ?? GPX_MAX_BYTES
  // UTF-16 code units are a fair, cheap upper bound proxy for the byte size.
  if (text.length > maxBytes) {
    throw new GpxImportError(
      'too-large',
      `Ce fichier GPX est trop volumineux (limite : ${Math.round(maxBytes / (1024 * 1024))} Mo).`,
    )
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) {
    throw new GpxImportError(
      'unsafe',
      'Ce fichier contient une déclaration DOCTYPE/ENTITY, qui n’a pas sa place dans un GPX. Il est refusé par prudence.',
    )
  }

  // Cheap pre-scan so an absurd file is refused before building a huge DOM.
  if (
    countOccurrences(text, '<wpt') > GPX_MAX_WAYPOINTS ||
    countOccurrences(text, 'trkpt') / 2 > GPX_MAX_POINTS
  ) {
    throw new GpxImportError('limits', limitsMessage())
  }

  let doc: Document
  try {
    doc = new DOMParser().parseFromString(text, 'application/xml')
  } catch {
    throw new GpxImportError('not-xml', 'Ce fichier n’est pas un document XML valide.')
  }
  if (doc.getElementsByTagName('parsererror').length > 0 || !doc.documentElement) {
    throw new GpxImportError(
      'not-xml',
      'Ce fichier n’est pas un document XML valide (fichier corrompu ou tronqué ?).',
    )
  }
  const root = doc.documentElement
  if (root.localName !== 'gpx') {
    throw new GpxImportError(
      'not-gpx',
      'Ce fichier XML n’est pas un fichier GPX (élément <gpx> absent).',
    )
  }

  const wptElements = children(root, 'wpt')
  const trkElements = children(root, 'trk')
  const rteElements = children(root, 'rte')
  const pointCount = countByLocalName(root, 'trkpt')
  if (wptElements.length > GPX_MAX_WAYPOINTS || pointCount > GPX_MAX_POINTS) {
    throw new GpxImportError('limits', limitsMessage())
  }

  const issues: GpxIssue[] = []
  const issue = (level: GpxIssue['level'], message: string) => {
    if (issues.length < 100) issues.push({ level, message })
  }
  const stats: GpxParseResult['stats'] = {
    waypointsFound: wptElements.length,
    waypointsInvalid: 0,
    tracksFound: trkElements.length,
    tracksSkipped: 0,
    pointsFound: pointCount,
    pointsInvalid: 0,
    routesIgnored: rteElements.length,
  }
  if (rteElements.length > 0) {
    issue(
      'info',
      `${rteElements.length} itinéraire(s) (<rte>) ignoré(s) : seuls les points de repère et les traces sont importés.`,
    )
  }

  const seenIds = new Set<string>()
  const safeId = (value: string | null | undefined): string | undefined => {
    if (!value || !SAFE_ID_PATTERN.test(value) || seenIds.has(value)) return undefined
    seenIds.add(value)
    return value
  }

  const waypoints: ParsedGpxWaypoint[] = []
  wptElements.forEach((wpt, index) => {
    const lat = parseStrictNumber(wpt.getAttribute('lat'))
    const lng = parseStrictNumber(wpt.getAttribute('lon'))
    if (lat === null || lng === null || !isValidLatLng(lat, lng)) {
      stats.waypointsInvalid++
      issue('warning', `Point de repère n° ${index + 1} ignoré : coordonnées invalides.`)
      return
    }
    const coordinate: Coordinate = { lat, lng }
    const ele = parseStrictNumber(childText(wpt, 'ele'))
    if (ele !== null) coordinate.altitude = ele
    const ext = ctrElement(wpt, 'waypoint')
    const accuracy = parseStrictNumber(ext?.getAttribute('accuracyMeters'))
    if (accuracy !== null && accuracy >= 0) coordinate.accuracyMeters = accuracy

    const note = (message: string) =>
      issue('warning', `Point n° ${index + 1} : ${message}`)
    const rawName = limitText(childText(wpt, 'name'), GPX_MAX_NAME_LENGTH, note, 'Nom')
    const name = rawName && rawName.trim() ? rawName : 'Point importé'
    const notes = limitText(
      childText(wpt, 'desc') ?? childText(wpt, 'cmt'),
      GPX_MAX_TEXT_LENGTH,
      note,
      'Texte',
    )
    const ctrCategory = ext?.getAttribute('category')
    const category: WaypointCategory = WAYPOINT_CATEGORIES.includes(
      ctrCategory as WaypointCategory,
    )
      ? (ctrCategory as WaypointCategory)
      : (categoryFromSymbol(childText(wpt, 'sym')) ?? 'general')
    const colorAttr = ext?.getAttribute('color')
    const color = WAYPOINT_COLORS.includes(colorAttr as WaypointColor)
      ? (colorAttr as WaypointColor)
      : undefined
    const time = parseTime(childText(wpt, 'time'))
    const wind = ext
      ?.getAttribute('optimalWind')
      ?.split(',')
      .map((v) => parseStrictNumber(v))
      .filter((v): v is number => v !== null && v >= 0 && v < 360)
    const territoryId = ext?.getAttribute('territoryId')
    waypoints.push({
      id: safeId(ext?.getAttribute('id')),
      name,
      notes,
      coordinate,
      category,
      color,
      territoryId:
        territoryId && SAFE_ID_PATTERN.test(territoryId) ? territoryId : undefined,
      optimalWindDirections: wind && wind.length > 0 ? wind : undefined,
      createdAt: time ?? nowIso,
      updatedAt: parseTime(ext?.getAttribute('updatedAt')) ?? time ?? nowIso,
      timeMissing: time === null,
    })
  })
  if (waypoints.some((w) => w.timeMissing)) {
    issue(
      'info',
      `${waypoints.filter((w) => w.timeMissing).length} point(s) de repère sans date dans le fichier : la date d’importation est utilisée.`,
    )
  }

  const tracks: ParsedGpxTrack[] = []
  trkElements.forEach((trk, index) => {
    const segments = children(trk, 'trkseg')
    const rawPoints = segments.flatMap((segment) => children(segment, 'trkpt'))
    const valid: { coordinate: Coordinate; time: string | null }[] = []
    let invalid = 0
    for (const pt of rawPoints) {
      const lat = parseStrictNumber(pt.getAttribute('lat'))
      const lng = parseStrictNumber(pt.getAttribute('lon'))
      if (lat === null || lng === null || !isValidLatLng(lat, lng)) {
        invalid++
        continue
      }
      const coordinate: Coordinate = { lat, lng }
      const ele = parseStrictNumber(childText(pt, 'ele'))
      if (ele !== null) coordinate.altitude = ele
      const accuracy = parseStrictNumber(
        ctrElement(pt, 'pt')?.getAttribute('accuracyMeters'),
      )
      if (accuracy !== null && accuracy >= 0) coordinate.accuracyMeters = accuracy
      valid.push({ coordinate, time: parseTime(childText(pt, 'time')) })
    }
    stats.pointsInvalid += invalid
    const label = `Trace n° ${index + 1}`
    if (invalid > 0) {
      issue(
        'warning',
        `${label} : ${invalid} point(s) aux coordonnées invalides ignoré(s).`,
      )
    }
    if (valid.length === 0) {
      stats.tracksSkipped++
      issue('warning', `${label} ignorée : aucun point valide.`)
      return
    }
    if (segments.length > 1) {
      issue(
        'info',
        `${label} : ${segments.length} segments fusionnés en une seule trace.`,
      )
    }
    const ext = ctrElement(trk, 'track')
    const firstTime = valid.find((p) => p.time)?.time ?? null
    const startedAt = parseTime(ext?.getAttribute('startedAt')) ?? firstTime ?? nowIso
    let withoutTime = 0
    const points: TrackPoint[] = valid.map(({ coordinate, time }) => {
      if (!time) withoutTime++
      return { ...coordinate, timestamp: time ?? startedAt }
    })
    if (withoutTime > 0) {
      issue(
        'warning',
        `${label} : ${withoutTime} point(s) sans heure ; l’heure de début de la trace leur est attribuée (la vitesse et la durée ne sont pas fiables).`,
      )
    }
    const note = (message: string) => issue('warning', `${label} : ${message}`)
    const rawName = limitText(childText(trk, 'name'), GPX_MAX_NAME_LENGTH, note, 'Nom')
    const lastTime = [...valid].reverse().find((p) => p.time)?.time ?? null
    const territoryId = ext?.getAttribute('territoryId')
    tracks.push({
      id: safeId(ext?.getAttribute('id')),
      name: rawName && rawName.trim() ? rawName : 'Trace importée',
      notes: limitText(
        childText(trk, 'desc') ?? childText(trk, 'cmt'),
        GPX_MAX_TEXT_LENGTH,
        note,
        'Texte',
      ),
      points,
      startedAt,
      endedAt: parseTime(ext?.getAttribute('endedAt')) ?? lastTime ?? undefined,
      distanceMeters: totalDistanceMeters(points),
      territoryId:
        territoryId && SAFE_ID_PATTERN.test(territoryId) ? territoryId : undefined,
      pointsWithoutTime: withoutTime,
    })
  })

  return { waypoints, tracks, issues, stats }
}
