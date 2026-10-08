import type Dexie from 'dexie'
import { db } from '@/database/db'
import type { Track, Waypoint } from '@/types'
import { APP_VERSION } from '../engine/appInfo'
import { buildGpx } from './gpxExport'
import type { GpxParseResult, ParsedGpxTrack, ParsedGpxWaypoint } from './gpxImport'

/** Database-facing part of GPX import/export (the XML work is in
 * `gpxExport.ts` / `gpxImport.ts`). */
export type GpxExportScope =
  | { kind: 'all' }
  | { kind: 'territory'; territoryId: string }
  | { kind: 'waypoint'; waypointId: string }
  | { kind: 'track'; trackId: string }

export interface GpxExportResult {
  xml: string
  fileName: string
  waypointCount: number
  trackCount: number
}

export interface ExportChoices {
  territories: { id: string; name: string }[]
  waypoints: { id: string; name: string }[]
  tracks: { id: string; name: string }[]
}

function hasTable(database: Dexie, name: string): boolean {
  return database.tables.some((t) => t.name === name)
}

async function loadTerritories(database: Dexie): Promise<{ id: string; name: string }[]> {
  if (!hasTable(database, 'territories')) return []
  const rows = (await database.table('territories').toArray()) as {
    id: string
    name: string
  }[]
  return rows.map(({ id, name }) => ({ id, name }))
}

export async function listExportChoices(database: Dexie = db): Promise<ExportChoices> {
  const [territories, waypoints, tracks] = await Promise.all([
    loadTerritories(database),
    database.table('waypoints').toArray() as Promise<Waypoint[]>,
    database.table('tracks').toArray() as Promise<Track[]>,
  ])
  const byName = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, 'fr')
  return {
    territories: territories.sort(byName),
    waypoints: waypoints.map(({ id, name }) => ({ id, name })).sort(byName),
    tracks: tracks.map(({ id, name }) => ({ id, name })).sort(byName),
  }
}

function dateStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function slug(text: string): string {
  const cleaned = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 40)
  return cleaned || 'export'
}

export async function exportGpx(
  scope: GpxExportScope,
  options: { database?: Dexie; now?: Date } = {},
): Promise<GpxExportResult> {
  const database = options.database ?? db
  const now = options.now ?? new Date()
  const territories = await loadTerritories(database)
  let waypoints = (await database.table('waypoints').toArray()) as Waypoint[]
  let tracks = (await database.table('tracks').toArray()) as Track[]
  let title = 'CTR Hunting — export complet'
  let part = 'tout'

  const territoryOf = (r: object) => (r as { territoryId?: string }).territoryId
  if (scope.kind === 'territory') {
    waypoints = waypoints.filter((w) => territoryOf(w) === scope.territoryId)
    tracks = tracks.filter((t) => territoryOf(t) === scope.territoryId)
    const name = territories.find((t) => t.id === scope.territoryId)?.name ?? 'territoire'
    title = `CTR Hunting — ${name}`
    part = slug(name)
  } else if (scope.kind === 'waypoint') {
    waypoints = waypoints.filter((w) => w.id === scope.waypointId)
    tracks = []
    title = `CTR Hunting — ${waypoints[0]?.name ?? 'point de repère'}`
    part = slug(waypoints[0]?.name ?? 'point')
  } else if (scope.kind === 'track') {
    tracks = tracks.filter((t) => t.id === scope.trackId)
    waypoints = []
    title = `CTR Hunting — ${tracks[0]?.name ?? 'trace'}`
    part = slug(tracks[0]?.name ?? 'trace')
  }

  const xml = buildGpx({
    waypoints,
    tracks,
    territories,
    title,
    now,
    appVersion: APP_VERSION,
  })
  return {
    xml,
    fileName: `ctr-hunting-${part}-${dateStamp(now)}.gpx`,
    waypointCount: waypoints.length,
    trackCount: tracks.length,
  }
}

// ---------------------------------------------------------------- import

export type GpxItemStatus = 'new' | 'present'

export interface GpxPlanItem<T> {
  item: T
  status: GpxItemStatus
  /** Id the record will get (kept from the file when safe and free). */
  id: string
}

export interface GpxImportPlan {
  waypoints: GpxPlanItem<ParsedGpxWaypoint>[]
  tracks: GpxPlanItem<ParsedGpxTrack>[]
  /** Items whose territory does not exist here: imported without one. */
  territoryDropped: number
}

export interface GpxImportReport {
  waypointsAdded: number
  tracksAdded: number
  alreadyPresent: number
}

export async function planGpxImport(
  parsed: GpxParseResult,
  options: { database?: Dexie; newId?: () => string } = {},
): Promise<GpxImportPlan> {
  const database = options.database ?? db
  const newId = options.newId ?? (() => crypto.randomUUID())
  const localWaypoints = (await database.table('waypoints').toArray()) as Waypoint[]
  const localTracks = (await database.table('tracks').toArray()) as Track[]
  const territoryIds = new Set((await loadTerritories(database)).map((t) => t.id))
  const usedIds = new Set([
    ...localWaypoints.map((w) => w.id),
    ...localTracks.map((t) => t.id),
  ])

  const wpKey = (name: string, lat: number, lng: number) => `${name}|${lat}|${lng}`
  const presentWaypoints = new Set(
    localWaypoints.map((w) => wpKey(w.name, w.coordinate.lat, w.coordinate.lng)),
  )
  const trkKey = (name: string, startedAt: string, count: number) =>
    `${name}|${new Date(startedAt).getTime()}|${count}`
  const presentTracks = new Set(
    localTracks.map((t) => trkKey(t.name, t.startedAt, t.points.length)),
  )

  let territoryDropped = 0
  const resolveTerritory = <T extends { territoryId?: string }>(item: T): T => {
    if (item.territoryId && !territoryIds.has(item.territoryId)) {
      territoryDropped++
      return { ...item, territoryId: undefined }
    }
    return item
  }
  const resolveId = (wanted: string | undefined): string => {
    if (wanted && !usedIds.has(wanted)) {
      usedIds.add(wanted)
      return wanted
    }
    let id = newId()
    while (usedIds.has(id)) id = newId()
    usedIds.add(id)
    return id
  }

  const waypoints = parsed.waypoints.map((raw): GpxPlanItem<ParsedGpxWaypoint> => {
    const present = presentWaypoints.has(
      wpKey(raw.name, raw.coordinate.lat, raw.coordinate.lng),
    )
    return {
      item: resolveTerritory(raw),
      status: present ? 'present' : 'new',
      id: present ? (raw.id ?? '') : resolveId(raw.id),
    }
  })
  const tracks = parsed.tracks.map((raw): GpxPlanItem<ParsedGpxTrack> => {
    const present = presentTracks.has(trkKey(raw.name, raw.startedAt, raw.points.length))
    return {
      item: resolveTerritory(raw),
      status: present ? 'present' : 'new',
      id: present ? (raw.id ?? '') : resolveId(raw.id),
    }
  })
  return { waypoints, tracks, territoryDropped }
}

function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T
}

/** Adds the « new » items in ONE transaction. Nothing existing is touched. */
export async function commitGpxImport(
  plan: GpxImportPlan,
  options: { database?: Dexie } = {},
): Promise<GpxImportReport> {
  const database = options.database ?? db
  const waypointRows = plan.waypoints
    .filter((p) => p.status === 'new')
    .map(({ item, id }) =>
      compact({
        id,
        name: item.name,
        coordinate: item.coordinate,
        category: item.category,
        color: item.color,
        notes: item.notes,
        optimalWindDirections: item.optimalWindDirections,
        territoryId: item.territoryId,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }),
    )
  const trackRows = plan.tracks
    .filter((p) => p.status === 'new')
    .map(({ item, id }) =>
      compact({
        id,
        name: item.name,
        points: item.points,
        startedAt: item.startedAt,
        endedAt: item.endedAt,
        distanceMeters: item.distanceMeters,
        notes: item.notes,
        territoryId: item.territoryId,
        kind: item.kind,
        color: item.color,
        breaks: item.breaks,
      }),
    )
  await database.transaction(
    'rw',
    [database.table('waypoints'), database.table('tracks')],
    async () => {
      if (waypointRows.length) await database.table('waypoints').bulkAdd(waypointRows)
      if (trackRows.length) await database.table('tracks').bulkAdd(trackRows)
    },
  )
  return {
    waypointsAdded: waypointRows.length,
    tracksAdded: trackRows.length,
    alreadyPresent:
      plan.waypoints.filter((p) => p.status === 'present').length +
      plan.tracks.filter((p) => p.status === 'present').length,
  }
}
