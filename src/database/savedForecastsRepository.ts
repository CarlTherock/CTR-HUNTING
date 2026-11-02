import { db } from './db'
import type { SavedForecast } from '@/types'

/**
 * Saved forecasts (« Télécharger pour ma sortie »). A put is one Dexie
 * transaction: if it fails (quota, closed database) the previous record with
 * the same id is left exactly as it was.
 */
export async function listSavedForecasts(): Promise<SavedForecast[]> {
  const all = await db.savedForecasts.toArray()
  return all.sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt))
}

export async function getSavedForecast(id: string): Promise<SavedForecast | undefined> {
  return db.savedForecasts.get(id)
}

export async function putSavedForecast(record: SavedForecast): Promise<void> {
  await db.savedForecasts.put(record)
}

export async function deleteSavedForecast(id: string): Promise<void> {
  await db.savedForecasts.delete(id)
}

export async function countSavedForecasts(): Promise<number> {
  return db.savedForecasts.count()
}
