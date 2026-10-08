import Dexie from 'dexie'

/**
 * Throw-away Dexie databases for the backup tests. Same stores as the app's
 * `FieldTerrainDatabase` (v1–v4) plus, optionally, the v5 `territories`
 * table and `territoryId` indexes — so the backup engine is exercised against
 * both shapes without depending on which slice of the app adds territories.
 */
let counter = 0

export function createTestDatabase(options: { territories?: boolean } = {}): Dexie {
  const database = new Dexie(`backup-test-${Date.now()}-${counter++}`)
  database.version(1).stores({
    waypoints: 'id, category, createdAt',
    tracks: 'id, startedAt',
    observations: 'id, waypointId, timestamp',
    settings: 'key',
    syncQueue: 'id, entity, entityId, queuedAt',
  })
  database.version(2).stores({ photos: 'id, waypointId, createdAt' })
  database.version(3).stores({ offlineAreas: 'id, status, createdAt' })
  database.version(4).stores({ photos: 'id, waypointId, observationId, createdAt' })
  if (options.territories !== false) {
    database.version(5).stores({
      territories: 'id, name, createdAt',
      waypoints: 'id, category, createdAt, territoryId',
      tracks: 'id, startedAt, territoryId',
      observations: 'id, waypointId, timestamp, territoryId',
    })
  }
  return database
}

export function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values)
}

export function blobOf(data: Uint8Array, type = 'image/jpeg'): Blob {
  return new Blob([data as BlobPart], { type })
}

/** Deterministic pseudo-random bytes (a tiny LCG), so photo content is varied. */
export function randomBytes(length: number, seed = 1): Uint8Array {
  const out = new Uint8Array(length)
  let state = seed >>> 0
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    out[i] = state >>> 24
  }
  return out
}

export async function bytesOfBlob(blob: Blob): Promise<number[]> {
  return Array.from(new Uint8Array(await blob.arrayBuffer()))
}

export interface SeedResult {
  territoryId: string
  waypointId: string
  secondWaypointId: string
  trackId: string
  observationId: string
  photoIds: string[]
  areaId: string
}

/** A small but complete data set touching every backed-up table. */
export async function seedEverything(database: Dexie): Promise<SeedResult> {
  const hasTerritories = database.tables.some((t) => t.name === 'territories')
  const territoryId = 'terr-1'
  if (hasTerritories) {
    await database.table('territories').add({
      id: territoryId,
      name: 'Secteur nord',
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-02T10:00:00.000Z',
      notes: 'Lot du lac',
    })
  }
  const withTerritory = hasTerritories ? { territoryId } : {}
  await database.table('waypoints').bulkAdd([
    {
      id: 'wp-1',
      name: 'Poste du ruisseau',
      coordinate: {
        lat: 46.12345678901234,
        lng: -71.98765432109876,
        altitude: 231.4,
        accuracyMeters: 4.5,
      },
      category: 'stand_blind',
      color: '#22c55e',
      notes: 'Vent N/NE <b>gras</b> & "guillemets"',
      photoIds: ['ph-1', 'ph-2'],
      optimalWindDirections: [0, 45],
      createdAt: '2026-09-03T12:00:00.000Z',
      updatedAt: '2026-09-04T12:00:00.000Z',
      ...withTerritory,
    },
    {
      id: 'wp-2',
      name: 'Stationnement',
      coordinate: { lat: 46.2, lng: -71.9 },
      category: 'parking',
      createdAt: '2026-09-03T13:00:00.000Z',
      updatedAt: '2026-09-03T13:00:00.000Z',
    },
  ])
  await database.table('tracks').add({
    id: 'tr-1',
    name: 'Sortie du matin',
    startedAt: '2026-09-05T09:00:00.000Z',
    endedAt: '2026-09-05T10:00:00.000Z',
    distanceMeters: 1234.5,
    points: [
      {
        lat: 46.1,
        lng: -71.1,
        altitude: 100,
        accuracyMeters: 5,
        timestamp: '2026-09-05T09:00:00.000Z',
      },
      { lat: 46.10001, lng: -71.10002, timestamp: '2026-09-05T09:00:05.000Z' },
      { lat: 46.1002, lng: -71.1004, timestamp: '2026-09-05T09:30:00.000Z' },
    ],
    // Fields a recording slice may add: they must survive untouched.
    status: 'interrupted',
    interruptedAt: '2026-09-05T09:30:00.000Z',
    pauses: [
      { startedAt: '2026-09-05T09:10:00.000Z', endedAt: '2026-09-05T09:20:00.000Z' },
    ],
    ...withTerritory,
  })
  await database.table('observations').add({
    id: 'ob-1',
    coordinate: { lat: 46.15, lng: -71.95 },
    timestamp: '2026-09-06T07:00:00.000Z',
    notes: 'Traces fraîches <script>alert(1)</script>',
    waypointId: 'wp-1',
    photoIds: ['ph-3'],
    conditions: {
      temperatureCelsius: 4,
      windSpeedKmh: 8,
      windDirectionDegrees: 300,
      cloudCoverPercent: 40,
    },
    ...withTerritory,
  })
  const edited = randomBytes(2048, 7)
  const original = randomBytes(4096, 9)
  await database.table('photos').bulkAdd([
    {
      id: 'ph-1',
      waypointId: 'wp-1',
      blob: blobOf(edited),
      originalBlob: blobOf(original),
      coordinate: { lat: 46.1234, lng: -71.9876 },
      createdAt: '2026-09-03T12:05:00.000Z',
    },
    (() => {
      const same = blobOf(randomBytes(1500, 3))
      return {
        id: 'ph-2',
        waypointId: 'wp-1',
        blob: same,
        originalBlob: same,
        createdAt: '2026-09-03T12:06:00.000Z',
      }
    })(),
    (() => {
      const same = blobOf(randomBytes(900, 5), 'image/png')
      return {
        id: 'ph-3',
        observationId: 'ob-1',
        blob: same,
        originalBlob: same,
        createdAt: '2026-09-06T07:01:00.000Z',
      }
    })(),
  ])
  await database.table('offlineAreas').add({
    id: 'area-1',
    name: 'Lac Mégantic',
    bounds: { west: -71.3, south: 46.7, east: -71.1, north: 46.9 },
    minZoom: 10,
    maxZoom: 14,
    baseLayer: 'outdoor',
    status: 'complete',
    tileCount: 100,
    tilesDownloaded: 100,
    bytesDownloaded: 5_000_000,
    tileUrls: ['https://example.test/tile/1', 'https://example.test/tile/2'],
    createdAt: '2026-09-07T10:00:00.000Z',
    completedAt: '2026-09-07T10:30:00.000Z',
  })
  await database.table('settings').bulkAdd([
    { key: 'fieldModeEnabled', value: true },
    { key: 'lastWeatherForecast', value: { cached: true } },
    { key: 'someApiKey', value: 'SECRET-DO-NOT-EXPORT' },
    { key: 'lastBackupAt', value: '2026-01-01T00:00:00.000Z' },
  ])
  await database.table('syncQueue').add({
    id: 'sq-1',
    entity: 'waypoint',
    entityId: 'wp-1',
    operation: 'create',
    queuedAt: '2026-09-03T12:00:00.000Z',
  })
  return {
    territoryId,
    waypointId: 'wp-1',
    secondWaypointId: 'wp-2',
    trackId: 'tr-1',
    observationId: 'ob-1',
    photoIds: ['ph-1', 'ph-2', 'ph-3'],
    areaId: 'area-1',
  }
}
