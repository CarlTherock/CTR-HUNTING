import { measureLayout } from './support/layout'
import { expect, test } from './support/test'
import {
  readStore,
  readTerritories,
  type StoredTerritoryItem,
} from './support/territoryData'
import { VIEWPORTS } from './support/viewports'
import { createWaypointViaUi } from './support/waypointData'

/**
 * Territories (logical folders): create, file a waypoint, filter list and
 * map, delete with an explicit confirmation that moves the content to
 * « Non classé ». Chromium + simulated map backend; no geographic boundary
 * exists, a territory is only a folder.
 */

test.describe('territoires : parcours complet', () => {
  test('créer, affecter un point, filtrer (liste et carte), supprimer avec confirmation', async ({
    page,
    backend,
  }) => {
    void backend
    await page.goto('map')
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()

    // Two waypoints, both « Non classé » at first (the existing-data case).
    const nord = await createWaypointViaUi(page, 'Poste du nord', { x: 200, y: 250 })
    await createWaypointViaUi(page, 'Cache libre', { x: 90, y: 330 })
    await expect(page.getByTestId('waypoint-marker')).toHaveCount(2)

    // Create a territory from the Waypoints page.
    await page.goto('waypoints')
    await page.getByRole('button', { name: 'Gérer les territoires' }).click()
    const manager = page.getByRole('region', { name: 'Gestion des territoires' })
    await expect(manager.getByTestId('unclassified-row')).toContainText('Non classé')
    await manager.getByLabel('Nom du nouveau territoire').fill('Secteur nord')
    await manager.getByRole('button', { name: 'Créer', exact: true }).click()
    await expect(manager.getByText('Secteur nord')).toBeVisible()
    await expect.poll(async () => (await readTerritories(page)).length).toBe(1)
    const [territory] = await readTerritories(page)

    // File "Poste du nord" in it. Only the folder changes: the position stays.
    await page.getByText('Poste du nord').first().click()
    await page
      .getByLabel('Territoire', { exact: true })
      .last()
      .selectOption({ label: 'Secteur nord' })
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await expect
      .poll(async () => {
        const items = await readStore<StoredTerritoryItem>(page, 'waypoints')
        return items.find((w) => w.id === nord.id)?.territoryId
      })
      .toBe(territory?.id)
    const stored = (await readStore<StoredTerritoryItem>(page, 'waypoints')).find(
      (w) => w.id === nord.id,
    )
    expect(stored?.coordinate).toEqual(nord.coordinate)

    // Filter the list.
    const filter = page.getByLabel('Territoire', { exact: true }).first()
    await filter.selectOption({ label: 'Secteur nord' })
    await expect(page.getByText('Poste du nord').first()).toBeVisible()
    await expect(page.getByText('Cache libre')).toHaveCount(0)
    await filter.selectOption({ label: 'Non classé' })
    await expect(page.getByText('Cache libre').first()).toBeVisible()
    await expect(page.getByText('Poste du nord')).toHaveCount(0)

    // The filter follows to the map (and survives the reload).
    await filter.selectOption({ label: 'Secteur nord' })
    await page.goto('map')
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
    await expect(page.getByTestId('waypoint-marker')).toHaveCount(1)
    await expect(page.getByText('1 élément masqué par le filtre')).toBeVisible()
    await page.getByRole('button', { name: /masqué par le filtre/ }).click()
    await expect(page.getByTestId('waypoint-marker')).toHaveCount(2)
    await expect(page.getByText(/masqué par le filtre/)).toHaveCount(0)

    // Delete the territory: explicit confirmation, nothing is lost.
    await page.goto('waypoints')
    await page.getByRole('button', { name: 'Gérer les territoires' }).click()
    await page.getByRole('button', { name: 'Supprimer Secteur nord' }).click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText('1 élément')
    await expect(dialog).toContainText('déplacés vers « Non classé »')
    await expect(dialog).toContainText('Aucun point, aucune trace et aucune entrée')
    // Cancelling changes nothing.
    await dialog.getByRole('button', { name: 'Annuler' }).click()
    expect(await readTerritories(page)).toHaveLength(1)

    await page.getByRole('button', { name: 'Supprimer Secteur nord' }).click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Supprimer le territoire' })
      .click()
    await expect(page.getByRole('status')).toContainText('1 élément déplacé')
    await expect.poll(async () => (await readTerritories(page)).length).toBe(0)

    const after = await readStore<StoredTerritoryItem>(page, 'waypoints')
    expect(after).toHaveLength(2)
    expect(after.every((w) => w.territoryId === undefined)).toBe(true)
    expect(after.find((w) => w.id === nord.id)?.coordinate).toEqual(nord.coordinate)
    await expect(page.getByText('Poste du nord').first()).toBeVisible()
  })
})

const TERRITORY_VIEWPORTS = [
  ...VIEWPORTS,
  { name: '568x320 (paysage)', width: 568, height: 320, mobile: true },
]

test.describe('territoires : mise en page et cibles tactiles', () => {
  for (const viewport of TERRITORY_VIEWPORTS) {
    test(`${viewport.name} : pas de défilement horizontal, cibles >= 44 px`, async ({
      page,
      backend,
    }) => {
      void backend
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto('waypoints')
      await page.getByRole('button', { name: 'Gérer les territoires' }).click()
      const manager = page.getByRole('region', { name: 'Gestion des territoires' })
      await manager
        .getByLabel('Nom du nouveau territoire')
        .fill(
          'Un territoire au nom volontairement très long pour tester le retour à la ligne',
        )
      await manager.getByRole('button', { name: 'Créer', exact: true }).click()
      await expect.poll(async () => (await readTerritories(page)).length).toBe(1)
      await page.getByRole('button', { name: /^Supprimer Un territoire/ }).click()
      await expect(page.getByRole('alertdialog')).toBeVisible()

      const layout = await measureLayout(page, '[aria-label="Gestion des territoires"]')
      expect(layout.document.scrollWidth, 'défilement horizontal').toBeLessThanOrEqual(
        layout.document.clientWidth,
      )
      expect(layout.controls.length).toBeGreaterThan(0)
      for (const control of layout.controls) {
        expect(control.rect.x, control.label).toBeGreaterThanOrEqual(-0.5)
        expect(control.rect.x + control.rect.width, control.label).toBeLessThanOrEqual(
          layout.viewport.innerWidth + 0.5,
        )
        expect(control.minSide, `${control.label} >= 44 px`).toBeGreaterThanOrEqual(43.5)
      }

      // The filter select (outside the manager) is also a full-size target.
      const filterBox = await page
        .getByLabel('Territoire', { exact: true })
        .first()
        .boundingBox()
      expect(filterBox?.height ?? 0).toBeGreaterThanOrEqual(43.5)
    })
  }
})
