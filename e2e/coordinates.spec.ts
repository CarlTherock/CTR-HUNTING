import type { Page } from '@playwright/test'
import { stubClipboardDenied, stubGps } from './support/browserStubs'
import { measureLayout } from './support/layout'
import { expect, test } from './support/test'
import {
  createWaypointViaUi,
  expectedLatitude,
  expectedLongitude,
} from './support/waypointData'

/**
 * Readable, copyable coordinates of a saved waypoint, the highlighted
 * marker, and the "Ma position" states. Chromium + simulated map backend;
 * clipboard permission is granted through Playwright, GPS is a SIMULATED
 * receiver. None of this is a validation on a physical iPhone.
 */

async function openWaypointSheet(page: Page) {
  await page.getByTestId('waypoint-marker').first().click()
  await expect(page.getByRole('region', { name: 'Position du waypoint' })).toBeVisible()
}

test.describe('coordonnées du waypoint : affichage et copie', () => {
  test.beforeEach(async ({ context, page, backend }) => {
    void backend
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('map')
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
  })

  test('nom et coordonnées en grand, étiquetées, sélectionnables ; copie réelle', async ({
    page,
  }) => {
    const saved = await createWaypointViaUi(page, 'Mirador nord', { x: 200, y: 250 })
    await openWaypointSheet(page)

    const block = page.getByRole('region', { name: 'Position du waypoint' })
    await expect(block.getByTestId('waypoint-name')).toHaveText('Mirador nord')
    await expect(block.getByText('Latitude', { exact: true })).toBeVisible()
    await expect(block.getByText('Longitude', { exact: true })).toBeVisible()
    await expect(block.getByTestId('waypoint-latitude')).toHaveText(
      expectedLatitude(saved.coordinate.lat),
    )
    await expect(block.getByTestId('waypoint-longitude')).toHaveText(
      expectedLongitude(saved.coordinate.lng),
    )
    await expect(
      block.getByText('Les décimales affichées ne mesurent pas la précision du GPS.'),
    ).toBeVisible()

    for (const id of ['waypoint-name', 'waypoint-latitude', 'waypoint-longitude']) {
      const style = await block.getByTestId(id).evaluate((el) => ({
        size: parseFloat(getComputedStyle(el).fontSize),
        select: getComputedStyle(el).userSelect,
      }))
      expect(style.size, `${id} font size`).toBeGreaterThanOrEqual(24)
      expect(style.select, `${id} user-select`).toBe('text')
    }

    // Copy: confirmation only after a real copy; the clipboard really holds it.
    await expect(page.getByText('Coordonnées copiées')).toHaveCount(0)
    await page.getByRole('button', { name: 'Copier les coordonnées' }).click()
    await expect(page.getByText('Coordonnées copiées')).toBeVisible()
    const clipboard = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipboard).toBe(
      `${saved.coordinate.lat.toFixed(5)}, ${saved.coordinate.lng.toFixed(5)}`,
    )
    expect(clipboard).toMatch(/^-?\d+\.\d{5}, -?\d+\.\d{5}$/)
  })

  test('presse-papiers refusé : alerte, aucune confirmation', async ({ page }) => {
    await createWaypointViaUi(page, 'Refus', { x: 200, y: 250 })
    await page.evaluate(() => {
      Object.defineProperty(Clipboard.prototype, 'writeText', {
        configurable: true,
        writable: true,
        value: () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
      })
      document.execCommand = () => false
    })
    await openWaypointSheet(page)

    await page.getByRole('button', { name: 'Copier les coordonnées' }).click()

    await expect(page.getByRole('alert')).toHaveText(
      'Copie impossible — sélectionnez et copiez le texte manuellement.',
    )
    await expect(page.getByText('Coordonnées copiées')).toHaveCount(0)
  })

  test('le marqueur sélectionné est mis en évidence sans bouger, les autres restent cliquables', async ({
    page,
  }) => {
    const first = await createWaypointViaUi(page, 'Premier', { x: 200, y: 250 })
    const second = await createWaypointViaUi(page, 'Second', { x: 90, y: 330 })
    void first
    void second
    const markers = page.getByTestId('waypoint-marker')
    await expect(markers).toHaveCount(2)
    await expect(
      page.locator('[data-testid="waypoint-marker"][data-selected]'),
    ).toHaveCount(0)

    const firstMarker = markers.nth(0)
    const before = await firstMarker.boundingBox()
    await firstMarker.click()
    await expect(page.getByTestId('waypoint-name')).toHaveText('Premier')

    const selected = page.locator('[data-testid="waypoint-marker"][data-selected="true"]')
    await expect(selected).toHaveCount(1)
    const after = await selected.boundingBox()
    expect(before && after).toBeTruthy()
    if (before && after) {
      expect(after.width).toBeGreaterThan(before.width)
      // Same centre: the highlight does not move the point.
      expect(
        Math.abs(after.x + after.width / 2 - (before.x + before.width / 2)),
      ).toBeLessThan(1)
      expect(
        Math.abs(after.y + after.height / 2 - (before.y + before.height / 2)),
      ).toBeLessThan(1)
    }
    // >= 44 px touch target on every marker, selected or not.
    for (const index of [0, 1]) {
      const hit = await markers.nth(index).locator('[data-hit-area]').boundingBox()
      expect(hit?.width).toBeGreaterThanOrEqual(44)
      expect(hit?.height).toBeGreaterThanOrEqual(44)
    }

    // Another marker stays clickable and takes over the highlight.
    await markers.nth(1).click()
    await expect(page.getByTestId('waypoint-name')).toHaveText('Second')
    await expect(selected).toHaveCount(1)
    await expect(markers.nth(1)).toHaveAttribute('data-selected', 'true')
    await expect(markers.nth(0)).not.toHaveAttribute('data-selected', 'true')

    await page.getByRole('button', { name: 'Fermer sans enregistrer' }).click()
    await expect(
      page.locator('[data-testid="waypoint-marker"][data-selected]'),
    ).toHaveCount(0)
  })
})

const LAYOUTS = [
  { name: 'portrait 390x844', width: 390, height: 844 },
  { name: 'paysage 844x390', width: 844, height: 390 },
] as const

for (const c of LAYOUTS) {
  test.describe(`fiche du waypoint — ${c.name}`, () => {
    test.use({
      viewport: { width: c.width, height: c.height },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    })

    test('la carte de la fiche défile, reste dans l’écran et ses boutons sont atteignables', async ({
      page,
      backend,
    }) => {
      void backend
      await stubGps(page, {
        kind: 'fix',
        lat: 46.5,
        lng: -71.25,
        accuracy: 6,
        ageMs: 2000,
      })
      await page.goto('map')
      await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
      await createWaypointViaUi(page, 'Poste de la crête', { x: 150, y: 150 })
      await page.getByTestId('waypoint-marker').first().tap()

      const block = page.getByRole('region', { name: 'Position du waypoint' })
      await expect(block).toBeVisible()
      const card = page.locator('div.overflow-y-auto', { has: block })
      await expect(card).toBeVisible()

      const box = await card.boundingBox()
      expect(box).toBeTruthy()
      if (box) {
        expect(box.y).toBeGreaterThanOrEqual(0)
        expect(box.y + box.height).toBeLessThanOrEqual(c.height + 0.5)
        expect(box.height).toBeLessThanOrEqual(c.height * 0.8 + 1)
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(c.width + 0.5)
      }
      // Name + both coordinates are readable straight away (no scrolling needed).
      for (const id of ['waypoint-name', 'waypoint-latitude', 'waypoint-longitude']) {
        const r = await block.getByTestId(id).boundingBox()
        expect(r && r.y >= 0 && r.y + r.height <= c.height, `${id} dans l’écran`).toBe(
          true,
        )
      }

      // The card scrolls; every button can be brought into view and tapped.
      const scrolls = await card.evaluate((el) => el.scrollHeight > el.clientHeight)
      if (c.height < 500) expect(scrolls).toBe(true)
      for (const name of [
        'Copier les coordonnées',
        'Enregistrer',
        'Supprimer',
        'Fermer sans enregistrer',
      ]) {
        const button = card.getByRole('button', { name, exact: true })
        await button.scrollIntoViewIfNeeded()
        const r = await button.boundingBox()
        expect(r, name).toBeTruthy()
        if (r) {
          expect(r.y, name).toBeGreaterThanOrEqual(-0.5)
          expect(r.y + r.height, name).toBeLessThanOrEqual(c.height + 0.5)
          expect(r.height, `${name} >= 44 px`).toBeGreaterThanOrEqual(43.5)
        }
      }
      const layout = await measureLayout(page)
      expect(layout.document.scrollWidth).toBeLessThanOrEqual(layout.document.clientWidth)
    })
  })
}

test.describe('« Ma position » : états du GPS (récepteur SIMULÉ)', () => {
  async function openWithGps(
    page: Page,
    gps: Parameters<typeof stubGps>[1],
    backend: unknown,
  ) {
    void backend
    await stubGps(page, gps)
    await page.goto('map')
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
    await createWaypointViaUi(page, 'Point GPS', { x: 200, y: 250 })
    await openWaypointSheet(page)
    return page.getByTestId('my-position')
  }

  test('aucun signal : « Recherche… » et aucune position inventée', async ({
    page,
    backend,
  }) => {
    const mine = await openWithGps(page, { kind: 'searching' }, backend)
    await expect(mine.getByTestId('gps-state')).toHaveText('Recherche…')
    await expect(mine.getByTestId('gps-reason')).toContainText('En attente')
    await expect(mine.getByText(/°/)).toHaveCount(0)
    await expect(
      mine.getByRole('button', { name: /Partager ma position|Copier/ }),
    ).toHaveCount(0)
    await expect(page.getByText('GPS : recherche…')).toBeVisible()
  })

  test('refusé : « Refusé » avec la raison', async ({ page, backend }) => {
    const mine = await openWithGps(page, { kind: 'denied' }, backend)
    await expect(mine.getByTestId('gps-state')).toHaveText('Refusé')
    await expect(mine.getByTestId('gps-reason')).toHaveText(
      'Autorisation de localisation refusée.',
    )
    await expect(mine.getByText(/°/)).toHaveCount(0)
    await expect(page.getByText('GPS refusé')).toBeVisible()
  })

  test('relevé ancien : « Ancien », précision et âge affichés, partage encore possible', async ({
    page,
    backend,
  }) => {
    const mine = await openWithGps(
      page,
      { kind: 'fix', lat: 46.5, lng: -71.25, accuracy: 8.2, ageMs: 60_000 },
      backend,
    )
    await expect(mine.getByTestId('gps-state')).toHaveText('Ancien')
    await expect(mine.getByTestId('gps-accuracy-age')).toContainText('Précision ±8 m')
    await expect(mine.getByTestId('gps-accuracy-age')).toContainText(
      /relevé il y a 1 min/,
    )
    await expect(mine.getByText('46,50000° N · 71,25000° O')).toBeVisible()
    await expect(page.getByText('GPS ancien ±8 m')).toBeVisible()
  })

  test('relevé très ancien : plus de partage de position', async ({ page, backend }) => {
    const mine = await openWithGps(
      page,
      { kind: 'fix', lat: 46.5, lng: -71.25, accuracy: 8, ageMs: 10 * 60_000 },
      backend,
    )
    await expect(mine.getByTestId('gps-state')).toHaveText('Ancien')
    await expect(mine.getByTestId('gps-warning')).toContainText('trop ancien')
    await expect(mine.getByTestId('snapshot-explanation')).toHaveCount(0)
  })

  test('relevé récent : « Disponible » avec précision et âge', async ({
    page,
    backend,
  }) => {
    const mine = await openWithGps(
      page,
      { kind: 'fix', lat: 46.5, lng: -71.25, accuracy: 5, ageMs: 1000 },
      backend,
    )
    await expect(mine.getByTestId('gps-state')).toHaveText('Disponible')
    await expect(mine.getByTestId('gps-accuracy-age')).toContainText(
      /Précision ±5 m · relevé (à l’instant|il y a \d+ s)/,
    )
  })
})

test('presse-papiers refusé (adaptateur) : le test d’échec ne dépend pas du repli execCommand', async ({
  page,
  backend,
}) => {
  void backend
  await stubClipboardDenied(page)
  await page.goto('map')
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
  await createWaypointViaUi(page, 'Refus 2', { x: 200, y: 250 })
  await openWaypointSheet(page)
  await page.getByRole('button', { name: 'Copier les coordonnées' }).click()
  await expect(page.getByRole('alert')).toContainText('Copie impossible')
  await expect(page.getByText('Coordonnées copiées')).toHaveCount(0)
})
