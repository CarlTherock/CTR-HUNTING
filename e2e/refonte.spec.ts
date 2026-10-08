import type { Page } from '@playwright/test'
import { VIEWPORTS, type ViewportCase } from './support/viewports'
import { installAnalysisProviders } from './support/analysisProviders'
import { expect, test } from './support/test'

/**
 * Refonte : navigation, contrôles de carte (2D/3D + relief, zoom dans Outils),
 * panneau des couches, vent, DeerTracker et Projet et progression, aux 8
 * tailles requises. Chromium uniquement, carte / GPS / fournisseurs SIMULÉS :
 * ceci ne valide PAS un iPhone réel ni un fournisseur de cartes réel.
 */
const SIZES: readonly ViewportCase[] = [
  ...VIEWPORTS.filter((v) => !v.name.startsWith('844x390')),
  { name: '568x320 (paysage)', width: 568, height: 320, mobile: true },
  { name: '844x390 (paysage)', width: 844, height: 390, mobile: true },
]
const SHOT_SIZES = new Set(['390x844', '568x320', '1440x900'])

async function noHorizontalOverflow(page: Page) {
  const o = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }))
  expect(o.scroll, 'débordement horizontal').toBeLessThanOrEqual(o.client + 1)
}

async function shot(page: Page, size: ViewportCase, name: string) {
  const slug = size.name.split(' ')[0] ?? size.name
  if (process.env.E2E_SCREENSHOTS === '1' && SHOT_SIZES.has(slug)) {
    await page.screenshot({ path: `docs/validation/refonte-${name}-${slug}.png` })
  }
}

/** Every named control is visible, on screen and not covered by another. */
async function expectReachable(page: Page, names: (string | RegExp)[]) {
  const boxes: { name: string; x: number; y: number; w: number; h: number }[] = []
  for (const name of names) {
    const button = page.getByRole('button', { name }).first()
    await expect(button).toBeVisible()
    await expect(button).toBeInViewport({ ratio: 1 })
    const box = await button.boundingBox()
    if (!box) throw new Error(`pas de boîte pour ${String(name)}`)
    const hit = await button.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return !!top && (el === top || el.contains(top))
    })
    expect(hit, `${String(name)} est recouvert`).toBe(true)
    boxes.push({ name: String(name), x: box.x, y: box.y, w: box.width, h: box.height })
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      const overlap =
        a.x < b.x + b.w - 1 &&
        b.x < a.x + a.w - 1 &&
        a.y < b.y + b.h - 1 &&
        b.y < a.y + a.h - 1
      expect(overlap, `${a.name} chevauche ${b.name}`).toBe(false)
    }
  }
}

for (const size of SIZES) {
  test.describe(`refonte ${size.name}`, () => {
    test.use({
      viewport: { width: size.width, height: size.height },
      hasTouch: size.mobile,
      isMobile: size.mobile,
      deviceScaleFactor: size.mobile ? 2 : 1,
      permissions: ['geolocation'],
      geolocation: { latitude: 46.8, longitude: -71.2, accuracy: 6 },
    })

    test('carte : 2D/3D et relief sur le rail, zoom dans Outils, couches bornées', async ({
      page,
      backend,
    }) => {
      void backend
      await page.goto('map')
      await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()

      // Plus de boutons de zoom +/− permanents sur la carte.
      await expect(page.getByRole('button', { name: 'Zoom avant' })).toHaveCount(0)
      await expectReachable(page, ['2D', '3D', 'Couches', 'Outils'])

      // Relief : seulement en 3D, sans chevauchement ni recouvrement.
      await expect(
        page.getByRole('group', { name: 'Exagération du relief' }),
      ).toHaveCount(0)
      await page.getByRole('button', { name: '3D', exact: true }).click()
      await expect(
        page.getByRole('group', { name: 'Exagération du relief' }),
      ).toBeVisible()
      await expectReachable(page, [
        '2D',
        '3D',
        "Augmenter l'exagération du relief",
        "Réduire l'exagération du relief",
        'Couches',
        'Outils',
      ])
      await shot(page, size, 'carte-3d')
      await page.getByRole('button', { name: '2D', exact: true }).click()

      // Le zoom reste disponible dans Outils.
      await page.getByRole('button', { name: 'Outils' }).click()
      const zoomIn = page.getByRole('button', { name: 'Zoom avant' })
      await expect(zoomIn).toBeVisible()
      await zoomIn.click()
      await shot(page, size, 'outils')
      await page.keyboard.press('Escape')

      // Panneau des couches : replié par défaut, borné dans l'écran.
      await page.getByRole('button', { name: 'Couches', exact: true }).click()
      const panel = page.getByRole('radiogroup', { name: 'Fond de carte' })
      await expect(panel).toBeVisible()
      const box = await panel.boundingBox()
      if (!box) throw new Error('panneau couches introuvable')
      expect(box.x).toBeGreaterThanOrEqual(-0.5)
      expect(box.x + box.width).toBeLessThanOrEqual(size.width + 0.5)
      await shot(page, size, 'couches')
      await noHorizontalOverflow(page)
    })

    test('pages : accueil, données, météo (vent), DeerTracker, projet', async ({
      page,
      backend,
    }) => {
      void backend
      await installAnalysisProviders(page)
      for (const [path, heading, name] of [
        ['', null, 'accueil'],
        ['data', null, 'donnees'],
        ['weather', 'Vent', 'meteo'],
        ['deertracker', null, 'deertracker'],
        ['project', null, 'projet'],
        ['more', null, 'plus'],
      ] as const) {
        await page.goto(path)
        await expect(page.locator('main')).toBeVisible()
        if (heading)
          await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible()
        await noHorizontalOverflow(page)
        await shot(page, size, name)
      }
      // Le panneau vent propose des heures réelles et reste utilisable.
      await page.goto('weather')
      const hours = page.getByRole('group', { name: 'Vent heure par heure' })
      await expect(hours).toBeVisible()
      await expect(hours.getByRole('button').first()).toBeVisible()
    })
  })
}
