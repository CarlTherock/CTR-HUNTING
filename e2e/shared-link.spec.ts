import { expect, test } from './support/test'
import { createWaypointViaUi, readWaypoints } from './support/waypointData'

/**
 * Cold open of a CTR Hunting point link (`?p=<lat>,<lng>&n=<name>` on the
 * app root, because the static host has no SPA fallback). Chromium +
 * simulated map backend.
 */
const LINK = '?p=46.8139,-71.208&n=Mirador'

test.describe('lien de point partagé', () => {
  test.beforeEach(async ({ backend }) => {
    void backend
  })

  test('ouverture à froid : aperçu distinct, rien d’écrit, puis enregistrement explicite', async ({
    page,
  }) => {
    await page.goto(LINK)

    await expect(page).toHaveURL(/\/CTR-HUNTING\/map$/)
    expect(new URL(page.url()).search).toBe('')
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()

    const card = page.getByTestId('shared-point-card')
    await expect(card).toBeVisible()
    await expect(card).toContainText('Point partagé : Mirador')
    await expect(card).toContainText('46,81390° N')
    await expect(card).toContainText('71,20800° O')

    // Distinct preview marker; not a saved waypoint marker.
    await expect(page.getByTestId('shared-point-marker')).toHaveCount(1)
    await expect(page.getByTestId('waypoint-marker')).toHaveCount(0)

    // Nothing is written until the user decides.
    expect(await readWaypoints(page)).toEqual([])
    await page.waitForTimeout(500)
    expect(await readWaypoints(page)).toEqual([])

    await card.getByRole('button', { name: 'Enregistrer comme point de repère' }).click()
    await expect(
      page.getByRole('region', { name: 'Position du nouveau point de repère' }),
    ).toBeVisible()
    expect(await readWaypoints(page), 'brouillon seulement').toEqual([])

    await page.getByRole('button', { name: 'Continuer' }).click()
    await expect(page.getByLabel('Nom')).toHaveValue('Mirador')
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()

    await expect.poll(async () => (await readWaypoints(page)).length).toBe(1)
    const [saved] = await readWaypoints(page)
    expect(saved.name).toBe('Mirador')
    expect(saved.coordinate).toEqual({ lat: 46.8139, lng: -71.208 })
    await expect(page.getByTestId('shared-point-marker')).toHaveCount(0)
    await expect(page.getByTestId('waypoint-marker')).toHaveCount(1)
  })

  test('Ignorer : l’aperçu disparaît et rien n’est enregistré', async ({ page }) => {
    await page.goto(LINK)
    const card = page.getByTestId('shared-point-card')
    await expect(card).toBeVisible()

    await card.getByRole('button', { name: 'Ignorer' }).click()

    await expect(card).toHaveCount(0)
    await expect(page.getByTestId('shared-point-marker')).toHaveCount(0)
    expect(await readWaypoints(page)).toEqual([])
  })

  test('un repère existant n’est jamais touché ni écrasé', async ({ page }) => {
    await page.goto('map')
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
    const existing = await createWaypointViaUi(page, 'Mirador', { x: 200, y: 250 })

    // Same name on purpose: a link must create a NEW waypoint, never replace.
    await page.goto(LINK)
    await expect(page.getByTestId('shared-point-card')).toBeVisible()
    expect(await readWaypoints(page)).toEqual([existing])

    await page.getByRole('button', { name: 'Enregistrer comme point de repère' }).click()
    await page.getByRole('button', { name: 'Continuer' }).click()
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()

    await expect.poll(async () => (await readWaypoints(page)).length).toBe(2)
    const all = await readWaypoints(page)
    expect(all.find((w) => w.id === existing.id)).toEqual(existing)
  })

  test('lien invalide : avis court, lien ignoré, URL nettoyée', async ({ page }) => {
    await page.goto('?p=999,10&n=Piege')

    await expect(page.getByRole('status')).toHaveText(/Lien de point partagé invalide/)
    await expect(page.getByTestId('shared-point-marker')).toHaveCount(0)
    await expect(page.getByTestId('shared-point-card')).toHaveCount(0)
    expect(new URL(page.url()).search).toBe('')
    await page.goto('map')
    expect(await readWaypoints(page)).toEqual([])
  })

  test('nom piégé : affiché comme texte, aucun HTML ni script exécuté', async ({
    page,
  }) => {
    const name = encodeURIComponent('<img src=x onerror="window.__pwned=1">Camp')
    await page.goto(`?p=46.8,-71.2&n=${name}`)

    const card = page.getByTestId('shared-point-card')
    await expect(card).toBeVisible()
    await expect(card).toContainText(
      'Point partagé : img src=x onerror="window.__pwned=1"Camp',
    )
    await expect(card.locator('img')).toHaveCount(0)
    await expect(page.locator('[data-testid="shared-point-marker"] img')).toHaveCount(0)
    expect(
      await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned),
    ).toBe(undefined)
  })

  test('nom trop long : tronqué à 80 caractères', async ({ page }) => {
    await page.goto(`?p=46.8,-71.2&n=${'a'.repeat(300)}`)
    const card = page.getByTestId('shared-point-card')
    await expect(card).toContainText(`Point partagé : ${'a'.repeat(80)}`)
    await expect(card).not.toContainText('a'.repeat(81))
  })
})

for (const c of [
  { name: 'portrait 390x844', width: 390, height: 844 },
  { name: 'paysage 844x390', width: 844, height: 390 },
] as const) {
  test.describe(`carte du point partagé — ${c.name}`, () => {
    test.use({
      viewport: { width: c.width, height: c.height },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    })

    test('la carte reste dans l’écran avec des boutons de 44 px', async ({
      page,
      backend,
    }) => {
      void backend
      await page.goto(LINK)
      const card = page.getByTestId('shared-point-card')
      await expect(card).toBeVisible()

      const box = await card.boundingBox()
      expect(box).toBeTruthy()
      if (box) {
        expect(box.y).toBeGreaterThanOrEqual(0)
        expect(box.y + box.height).toBeLessThanOrEqual(c.height + 0.5)
        expect(box.x + box.width).toBeLessThanOrEqual(c.width + 0.5)
        expect(box.height).toBeLessThanOrEqual(c.height * 0.8 + 1)
      }
      for (const name of ['Centrer', 'Enregistrer comme point de repère', 'Ignorer']) {
        const button = card.getByRole('button', { name })
        await button.scrollIntoViewIfNeeded()
        const r = await button.boundingBox()
        expect(r, name).toBeTruthy()
        if (r) {
          expect(r.height, name).toBeGreaterThanOrEqual(43.5)
          expect(r.y + r.height, name).toBeLessThanOrEqual(c.height + 0.5)
        }
      }
      // The preview marker is on the map, in the viewport once centred.
      await expect(page.getByTestId('shared-point-marker')).toHaveCount(1)
    })
  })
}
