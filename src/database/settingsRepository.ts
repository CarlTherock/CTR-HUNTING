import { db } from './db'

/**
 * Minimal generic repository for app-level settings. Feature-specific
 * repositories (waypointsRepository, tracksRepository, ...) are introduced
 * alongside their owning feature so we don't build data-access code for
 * features that don't exist yet.
 */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const record = await db.settings.get(key)
  return record ? (record.value as T) : fallback
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await db.settings.put({ key, value })
}
