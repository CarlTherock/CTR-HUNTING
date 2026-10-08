import type { Page } from '@playwright/test'
import { VIEWPORTS, type ViewportCase } from './support/viewports'
import { expect, test } from './support/test'

/**
 * Recherche de sang : visibilité ET interactivité du panneau de terrain aux 8
 * tailles requises, sans débordement. Chromium uniquement, carte et GPS
 * SIMULÉS (géolocalisation Playwright) : un iPhone réel n’est PAS couvert.
 */
const SIZES: readonly ViewportCase[] = [
  ...VIEWPORTS.filter((v) => !v.name.startsWith('844x390')),
  { name: '568x320 (paysage)', width: 568, height: 320, mobile: true },
  { name: '844x390 (paysage)', width: 844, height: 390, mobile: true },
]

async function countStore(page: Page, store: string): Promise<number> {
  return page.evaluate(
    (name) =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('field-terrain-intelligence')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const req = open.result.transaction(name, 'readonly').objectStore(name).count()
          req.onsuccess = () => resolve(req.result)
          req.onerror = () => reject(req.error)
        }
      }),
    store,
  )
}

async function startSearch(page: Page) {
  await page.goto('map')
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Outils' }).click()
  await page.getByRole('button', { name: 'Démarrer une recherche de sang' }).click()
}

async function overflow(page: Page) {
  return page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }))
}

for (const size of SIZES) {
  test.describe(`recherche de sang ${size.name}`, () => {
    test.use({
      viewport: { width: size.width, height: size.height },
      hasTouch: size.mobile,
      isMobile: size.mobile,
      deviceScaleFactor: size.mobile ? 2 : 1,
      permissions: ['geolocation'],
      geolocation: { latitude: 46.8, longitude: -71.2, accuracy: 6 },
    })

    test('le panneau tient à l’écran, + Sang est cliquable et crée de vrais points', async ({
      page,
      backend,
    }) => {
      void backend
      await startSearch(page)
      const panel = page.getByTestId('blood-panel')
      await expect(panel).toBeVisible()
      const add = panel.getByRole('button', { name: /\+ Sang/ })
      await expect(add).toBeVisible()
      await expect(add).toBeInViewport()
      const box = await panel.boundingBox()
      if (!box) throw new Error('panneau introuvable')
      expect(box.x).toBeGreaterThanOrEqual(-0.5)
      expect(box.x + box.width).toBeLessThanOrEqual(size.width + 0.5)
      expect(box.y + box.height).toBeLessThanOrEqual(size.height + 0.5)
      const o = await overflow(page)
      expect(o.scroll, 'défilement horizontal').toBeLessThanOrEqual(o.client)

      // Every control of the panel stays inside the panel (nothing clipped).
      const clipped = await panel.evaluate((el) => {
        const outer = el.getBoundingClientRect()
        return [...el.querySelectorAll('button')]
          .map((b) => ({
            label: b.textContent?.trim() ?? '',
            r: b.getBoundingClientRect(),
          }))
          .filter(
            ({ r }) =>
              r.width > 0 && (r.right > outer.right + 0.5 || r.left < outer.left - 0.5),
          )
          .map(({ label }) => label)
      })
      expect(clipped, 'boutons tronqués').toEqual([])

      await expect(add).toBeEnabled({ timeout: 15_000 })
      await add.click()
      await expect.poll(() => countStore(page, 'waypoints')).toBe(1)
      await add.click()
      await expect.poll(() => countStore(page, 'waypoints')).toBe(2)
      expect(await countStore(page, 'bloodSessions')).toBe(1)
      await expect(page.getByTestId('blood-status')).toBeVisible()

      // Immersive mode keeps the field controls reachable.
      await page.getByRole('button', { name: 'Mode immersif' }).click()
      await expect(
        page.getByTestId('blood-panel').getByRole('button', { name: /\+ Sang/ }),
      ).toBeInViewport()
      const o2 = await overflow(page)
      expect(o2.scroll).toBeLessThanOrEqual(o2.client)

      await page.screenshot({
        path: `test-results/blood-${size.name.replace(/\W+/g, '_')}.png`,
      })
    })
  })
}

test.describe('recherche de sang sans GPS', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('démarre en attente du GPS, sans position inventée', async ({ page, backend }) => {
    void backend
    await startSearch(page)
    await expect(page.getByTestId('blood-panel')).toBeVisible()
    await expect(page.getByTestId('blood-panel')).toContainText(/GPS/)
    expect(await countStore(page, 'waypoints')).toBe(0)
  })
})
