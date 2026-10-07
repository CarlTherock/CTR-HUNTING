import type { Page } from '@playwright/test'

export interface StoredTerritory {
  id: string
  name: string
  archivedAt?: string
}

export interface StoredTerritoryItem {
  id: string
  name?: string
  territoryId?: string
  coordinate?: { lat: number; lng: number }
}

/** Reads a whole IndexedDB object store (what is really persisted). */
export function readStore<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<T[]>((resolve, reject) => {
        const open = indexedDB.open('field-terrain-intelligence')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const all = open.result.transaction(name, 'readonly').objectStore(name).getAll()
          all.onsuccess = () => resolve(all.result as T[])
          all.onerror = () => reject(all.error)
        }
      }),
    store,
  )
}

export const readTerritories = (page: Page) =>
  readStore<StoredTerritory>(page, 'territories')
