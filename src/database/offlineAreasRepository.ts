import { db } from './db'
import type { LngLatBounds } from '@/utils/tiles'
import type { MapBaseLayerId, OfflineArea, OfflineAreaStatus } from '@/types'

export interface CreateOfflineAreaInput {
  name: string
  bounds: LngLatBounds
  minZoom: number
  maxZoom: number
  baseLayer: MapBaseLayerId
  tileCount: number
}

export type UpdateOfflineAreaInput = Partial<
  Pick<
    OfflineArea,
    'status' | 'tilesDownloaded' | 'bytesDownloaded' | 'tileUrls' | 'completedAt'
  >
>

/** Offline-area metadata CRUD against Dexie — same real
 * offline-read/write pattern as `waypointsRepository`/`tracksRepository`.
 * The tile bytes themselves are not here; see `offline/tileCache.ts`. */
export async function listOfflineAreas(): Promise<OfflineArea[]> {
  return db.offlineAreas.toArray()
}

export async function createOfflineArea(input: CreateOfflineAreaInput): Promise<OfflineArea> {
  const area: OfflineArea = {
    id: crypto.randomUUID(),
    name: input.name,
    bounds: input.bounds,
    minZoom: input.minZoom,
    maxZoom: input.maxZoom,
    baseLayer: input.baseLayer,
    status: 'downloading' as OfflineAreaStatus,
    tileCount: input.tileCount,
    tilesDownloaded: 0,
    bytesDownloaded: 0,
    tileUrls: [],
    createdAt: new Date().toISOString(),
  }
  await db.offlineAreas.add(area)
  return area
}

export async function updateOfflineArea(id: string, patch: UpdateOfflineAreaInput): Promise<void> {
  await db.offlineAreas.update(id, patch)
}

export async function deleteOfflineArea(id: string): Promise<void> {
  await db.offlineAreas.delete(id)
}
