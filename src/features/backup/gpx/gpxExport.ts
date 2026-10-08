import type { Track, Waypoint } from '@/types'
import { CTR_NS, GPX_NS, GPX_SYMBOL } from './gpxFormat'

/**
 * GPX 1.1 writer. Pure: no DOM, no database, no I/O.
 *
 * Standard elements carry everything a third-party reader needs (name, desc,
 * time, ele, sym, track points). Information GPX has no place for (category
 * id, colour, ids, territory, accuracy…) goes in `<extensions>` under the
 * app's own namespace, which GPX-compliant readers ignore.
 *
 * GPX is an exchange format, NOT a backup: photos, journal entries, offline
 * areas and any track field outside the list below are not in it. Use the
 * full backup (.zip) for that.
 */
export interface GpxExportInput {
  waypoints: readonly Waypoint[]
  tracks: readonly Track[]
  territories?: readonly { id: string; name: string }[]
  /** Document title (metadata/name). */
  title?: string
  now?: Date
  appVersion?: string
}

/** Characters that cannot appear in an XML 1.0 document at all. */
function stripInvalidXmlChars(text: string): string {
  let out = ''
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    const bad =
      (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) ||
      code === 0xfffe ||
      code === 0xffff
    if (!bad) out += char
  }
  return out
}

export function escapeXml(value: string): string {
  const maybe = value as string & { toWellFormed?: () => string }
  const wellFormed =
    typeof maybe.toWellFormed === 'function' ? maybe.toWellFormed() : value
  return stripInvalidXmlChars(wellFormed)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Shortest decimal text that parses back to the SAME double, without
 * exponent notation (not valid in GPX's xsd:decimal).
 */
export function formatNumber(value: number): string {
  const short = String(value)
  if (!/e/i.test(short)) return short
  const long = value.toFixed(40).replace(/0+$/, '').replace(/\.$/, '')
  return long === '-0' ? '0' : long
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const t = Date.parse(value)
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}

function tag(name: string, text: string | undefined, indent: string): string {
  return text === undefined || text === ''
    ? ''
    : `${indent}<${name}>${escapeXml(text)}</${name}>\n`
}

function attrs(values: Record<string, string | number | undefined>): string {
  return Object.entries(values)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(
      ([k, v]) =>
        ` ${k}="${escapeXml(typeof v === 'number' ? formatNumber(v) : String(v))}"`,
    )
    .join('')
}

function territoryOf(record: object): string | undefined {
  const value = (record as { territoryId?: unknown }).territoryId
  return typeof value === 'string' && value ? value : undefined
}

export function buildGpx(input: GpxExportInput): string {
  const now = (input.now ?? new Date()).toISOString()
  const territoryName = new Map((input.territories ?? []).map((t) => [t.id, t.name]))
  const out: string[] = []
  out.push('<?xml version="1.0" encoding="UTF-8"?>\n')
  out.push(
    `<gpx version="1.1" creator="${escapeXml(`CTR Hunting ${input.appVersion ?? ''}`.trim())}" ` +
      `xmlns="${GPX_NS}" xmlns:ctr="${CTR_NS}" ` +
      `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
      `xsi:schemaLocation="${GPX_NS} http://www.topografix.com/GPX/1/1/gpx.xsd">\n`,
  )
  out.push('  <metadata>\n')
  out.push(tag('name', input.title ?? 'CTR Hunting', '    '))
  out.push(`    <time>${now}</time>\n`)
  out.push('  </metadata>\n')

  for (const waypoint of input.waypoints) {
    const { lat, lng, altitude, accuracyMeters } = waypoint.coordinate
    out.push(`  <wpt lat="${formatNumber(lat)}" lon="${formatNumber(lng)}">\n`)
    if (altitude !== undefined && Number.isFinite(altitude)) {
      out.push(`    <ele>${formatNumber(altitude)}</ele>\n`)
    }
    const time = isoOrNull(waypoint.createdAt)
    if (time) out.push(`    <time>${time}</time>\n`)
    out.push(tag('name', waypoint.name, '    '))
    out.push(tag('desc', waypoint.notes, '    '))
    out.push(tag('sym', GPX_SYMBOL[waypoint.category] ?? GPX_SYMBOL.general, '    '))
    out.push(tag('type', waypoint.category, '    '))
    const territoryId = territoryOf(waypoint)
    out.push('    <extensions>\n')
    out.push(
      `      <ctr:waypoint${attrs({
        id: waypoint.id,
        category: waypoint.category,
        color: waypoint.color,
        territoryId,
        territory: territoryId ? territoryName.get(territoryId) : undefined,
        updatedAt: isoOrNull(waypoint.updatedAt) ?? undefined,
        accuracyMeters,
        sessionId: waypoint.sessionId,
        bloodKind: waypoint.bloodKind,
        origin: waypoint.origin,
        optimalWind: waypoint.optimalWindDirections?.length
          ? waypoint.optimalWindDirections.join(',')
          : undefined,
      })}/>\n`,
    )
    out.push('    </extensions>\n')
    out.push('  </wpt>\n')
  }

  for (const track of input.tracks) {
    out.push('  <trk>\n')
    out.push(tag('name', track.name, '    '))
    out.push(tag('desc', track.notes, '    '))
    const territoryId = territoryOf(track)
    out.push('    <extensions>\n')
    out.push(
      `      <ctr:track${attrs({
        id: track.id,
        startedAt: isoOrNull(track.startedAt) ?? undefined,
        endedAt: isoOrNull(track.endedAt) ?? undefined,
        distanceMeters: track.distanceMeters,
        kind: track.kind,
        color: track.color,
        sessionId: track.sessionId,
        territoryId,
        territory: territoryId ? territoryName.get(territoryId) : undefined,
      })}/>\n`,
    )
    out.push('    </extensions>\n')
    // One <trkseg> per continuous segment: a pause or an unobserved gap is
    // never bridged by a line in the exported file.
    const cuts = new Set(track.breaks ?? [])
    out.push('    <trkseg>\n')
    for (const [index, point] of track.points.entries()) {
      if (cuts.has(index) && index > 0) out.push('    </trkseg>\n    <trkseg>\n')
      out.push(
        `      <trkpt lat="${formatNumber(point.lat)}" lon="${formatNumber(point.lng)}">\n`,
      )
      if (point.altitude !== undefined && Number.isFinite(point.altitude)) {
        out.push(`        <ele>${formatNumber(point.altitude)}</ele>\n`)
      }
      const time = isoOrNull(point.timestamp)
      if (time) out.push(`        <time>${time}</time>\n`)
      if (point.accuracyMeters !== undefined && Number.isFinite(point.accuracyMeters)) {
        out.push(
          `        <extensions><ctr:pt${attrs({ accuracyMeters: point.accuracyMeters })}/></extensions>\n`,
        )
      }
      out.push('      </trkpt>\n')
    }
    out.push('    </trkseg>\n')
    out.push('  </trk>\n')
  }
  out.push('</gpx>\n')
  return out.join('')
}
