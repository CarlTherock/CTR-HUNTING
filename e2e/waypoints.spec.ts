import type { Page } from '@playwright/test'
import { expect, test } from './support/test'

/**
 * Waypoint creation as an explicit draft, then a permanent location lock.
 * Chromium + simulated map provider: proves the app's logic and persistence,
 * not the feel of drag/tap on a real iPhone.
 */
interface StoredWaypoint {
  name: string
  notes?: string
  coordinate: { lat: number; lng: number }
}

function readWaypoints(page: Page): Promise<StoredWaypoint[]> {
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

async function startDraft(page: Page, at: { x: number; y: number }) {
  await page.getByRole('button', { name: 'Ajouter un point de repère' }).click()
  await page.locator('canvas.maplibregl-canvas').click({ position: at })
  await expect(
    page.getByRole('region', { name: 'Position du nouveau point de repère' }),
  ).toBeVisible()
}

test.describe('points de repère : brouillon puis verrouillage', () => {
  test.beforeEach(async ({ page, backend }) => {
    void backend
    await page.goto('map')
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
  })

  test('annuler la création ne laisse aucun point', async ({ page }) => {
    await startDraft(page, { x: 200, y: 250 })
    await page.getByRole('button', { name: 'Annuler' }).click()
    await expect(
      page.getByRole('region', { name: 'Position du nouveau point de repère' }),
    ).toBeHidden()
    expect(await readWaypoints(page)).toEqual([])
    await page.reload()
    expect(await readWaypoints(page)).toEqual([])
  })

  test('ajuster, enregistrer, recharger : la position est verrouillée', async ({
    page,
  }) => {
    await startDraft(page, { x: 200, y: 250 })
    const bar = page.getByRole('region', { name: 'Position du nouveau point de repère' })
    const firstText = await bar.locator('p.tabular-nums').innerText()

    // Adjusting before Save is allowed: a second tap moves the draft.
    await page.locator('canvas.maplibregl-canvas').click({ position: { x: 260, y: 300 } })
    await expect(bar.locator('p.tabular-nums')).not.toHaveText(firstText)
    const adjustedText = await bar.locator('p.tabular-nums').innerText()
    expect(await readWaypoints(page), 'rien n’est écrit avant Enregistrer').toEqual([])

    await page.getByRole('button', { name: 'Continuer' }).click()
    await page.getByLabel('Nom').fill('Mirador nord')
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()

    await expect.poll(async () => (await readWaypoints(page)).length).toBe(1)
    const [saved] = await readWaypoints(page)
    expect(saved?.name).toBe('Mirador nord')
    const coordinate = saved?.coordinate

    await page.reload()
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
    expect((await readWaypoints(page))[0]?.coordinate).toEqual(coordinate)

    // Open the saved waypoint from the list: the position is read-only.
    await page.goto('waypoints')
    await page.getByText('Mirador nord').first().click()
    await expect(page.getByText(/Position verrouillée/)).toBeVisible()
    expect(adjustedText).toContain(coordinate ? coordinate.lat.toFixed(5) : 'x')
    await expect(page.getByRole('spinbutton')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /déplacer/i })).toHaveCount(0)

    // Editing metadata never moves it.
    await page.getByLabel('Notes').fill('Vu au lever du jour')
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await expect
      .poll(async () => (await readWaypoints(page))[0]?.notes)
      .toBe('Vu au lever du jour')
    expect((await readWaypoints(page))[0]?.coordinate).toEqual(coordinate)
  })
})
