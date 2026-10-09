import type { Page } from '@playwright/test'
import { expect } from './test'

export interface StoredWaypoint {
  id: string
  name: string
  notes?: string
  coordinate: { lat: number; lng: number }
}

/** Reads the waypoints straight from IndexedDB (what is really persisted). */
export function readWaypoints(page: Page): Promise<StoredWaypoint[]> {
  return page.evaluate(
    () =>
      new Promise<StoredWaypoint[]>((resolve, reject) => {
        const open = indexedDB.open('field-terrain-intelligence')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const all = open.result
            .transaction('waypoints', 'readonly')
            .objectStore('waypoints')
            .getAll()
          all.onsuccess = () => resolve(all.result as StoredWaypoint[])
          all.onerror = () => reject(all.error)
        }
      }),
  )
}

/** « + Repère » → Repère normal → Position sur la carte → Choisir sur la carte
 * (the next tap on the map places the waypoint draft). */
export async function armWaypointPlacing(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Ajouter un repère' }).click()
  await page.getByRole('radio', { name: 'Position sur la carte' }).click()
  await page.getByRole('button', { name: 'Choisir sur la carte' }).click()
}

/** Creates and saves a waypoint through the real UI (tap the map, Continuer,
 * name, optional notes, Enregistrer) and returns what was persisted. */
export async function createWaypointViaUi(
  page: Page,
  name: string,
  at: { x: number; y: number },
  notes?: string,
): Promise<StoredWaypoint> {
  const before = (await readWaypoints(page)).length
  await armWaypointPlacing(page)
  await page.locator('canvas.maplibregl-canvas').click({ position: at })
  await expect(
    page.getByRole('region', { name: 'Position du nouveau point de repère' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Continuer' }).click()
  await page.getByLabel('Nom').fill(name)
  if (notes) await page.getByLabel('Notes').fill(notes)
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect.poll(async () => (await readWaypoints(page)).length).toBe(before + 1)
  const saved = (await readWaypoints(page)).find((w) => w.name === name)
  if (!saved) throw new Error(`waypoint ${name} was not persisted`)
  return saved
}

/** French display used by the app: `46,81389° N` / `71,20800° O`. */
export function expectedLatitude(lat: number): string {
  return `${Math.abs(lat).toFixed(5).replace('.', ',')}° ${lat < 0 ? 'S' : 'N'}`
}
export function expectedLongitude(lng: number): string {
  return `${Math.abs(lng).toFixed(5).replace('.', ',')}° ${lng < 0 ? 'O' : 'E'}`
}
