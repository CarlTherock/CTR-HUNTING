import {
  applySafeArea,
  IPHONE_LANDSCAPE_SAFE_AREA,
  IPHONE_PORTRAIT_SAFE_AREA,
  measureLayout,
} from './support/layout'
import { expect, test } from './support/test'

/**
 * Immersive mode and the "Outils" bottom sheet, in portrait and landscape
 * with iPhone safe-area insets emulated (Chromium only).
 */
const CASES = [
  { name: 'portrait 390x844', width: 390, height: 844, safe: IPHONE_PORTRAIT_SAFE_AREA },
  { name: 'paysage 844x390', width: 844, height: 390, safe: IPHONE_LANDSCAPE_SAFE_AREA },
] as const

for (const c of CASES) {
  test.describe(`mode immersif et outils — ${c.name}`, () => {
    test.use({
      viewport: { width: c.width, height: c.height },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    })

    test.beforeEach(async ({ context, page, backend }) => {
      void backend
      await applySafeArea(context, page, c.safe)
      await page.goto('map')
      await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
    })

    test('le mode immersif masque la navigation, agrandit la carte dans les zones sûres et se quitte', async ({
      page,
    }) => {
      // Bottom bar on phones, sidebar from 768 px wide (incl. a phone in landscape).
      const nav = page.getByRole('navigation')
      const before = await measureLayout(page)

      await page.getByRole('button', { name: 'Mode immersif' }).click()

      await expect(
        page.getByRole('button', { name: 'Quitter le mode immersif' }),
      ).toBeVisible()
      await expect(page.locator('header')).toBeHidden()
      await expect(nav).toHaveCount(0)

      const immersive = await measureLayout(page)
      const container = immersive.rects.mapContainer
      const canvas = immersive.rects.canvas
      const beforeContainer = before.rects.mapContainer
      expect(container && canvas && beforeContainer).toBeTruthy()
      if (container && canvas && beforeContainer) {
        // Bigger than before, and not under the notch / home indicator / sides.
        expect(container.height).toBeGreaterThan(beforeContainer.height)
        expect(container.y).toBeGreaterThanOrEqual(c.safe.top - 0.5)
        expect(container.y + container.height).toBeLessThanOrEqual(
          c.height - c.safe.bottom + 0.5,
        )
        expect(container.x).toBeGreaterThanOrEqual(c.safe.left - 0.5)
        expect(container.x + container.width).toBeLessThanOrEqual(
          c.width - c.safe.right + 0.5,
        )
        // The engine was told to resize: canvas follows its container.
        await expect
          .poll(async () => {
            const m = await measureLayout(page)
            return Math.abs(
              (m.rects.canvas?.height ?? 0) - (m.rects.mapContainer?.height ?? 1),
            )
          })
          .toBeLessThanOrEqual(2)
      }
      expect(immersive.document.scrollHeight).toBeLessThanOrEqual(
        immersive.document.clientHeight,
      )
      expect(immersive.document.scrollWidth).toBeLessThanOrEqual(
        immersive.document.clientWidth,
      )
      const problems = immersive.controls
        .filter((x) => !x.inViewport || !x.hit)
        .map((x) => x.label)
      expect(problems, 'contrôles hors écran ou masqués en mode immersif').toEqual([])

      // Exit: the app navigation comes back.
      await page.getByRole('button', { name: 'Quitter le mode immersif' }).click()
      await expect(nav.first()).toBeVisible()
      await expect(page.getByRole('button', { name: 'Mode immersif' })).toBeVisible()
    })

    test('le tiroir « Outils » s’ouvre, liste des outils utilisables et se ferme (Échap, focus rendu)', async ({
      page,
    }) => {
      const opener = page.getByRole('button', { name: 'Outils' })
      await opener.focus()
      await opener.click()

      const dialog = page.getByRole('dialog', { name: 'Outils de la carte' })
      await expect(dialog).toBeVisible()
      await expect(
        dialog.getByRole('button', { name: 'Enregistrer une trace GPS' }),
      ).toBeVisible()
      await expect(
        dialog.getByRole('button', { name: 'Télécharger cette zone hors ligne' }),
      ).toBeVisible()

      // Everything in the sheet is inside the viewport (scrollable if needed) and >= 44px.
      const small = await dialog.getByRole('button').evaluateAll((els) =>
        els
          .map((el) => {
            const r = el.getBoundingClientRect()
            return {
              label: el.getAttribute('aria-label') ?? el.textContent?.trim(),
              w: r.width,
              h: r.height,
            }
          })
          .filter((b) => b.h < 44 || b.w < 44),
      )
      expect(small, 'boutons du tiroir < 44 px').toEqual([])

      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await expect(opener).toBeFocused()
    })

    test('un outil du tiroir s’arme et ferme le tiroir pour laisser la carte visible', async ({
      page,
    }) => {
      await page.getByRole('button', { name: 'Outils' }).click()
      await page.getByRole('button', { name: 'Altitude, pente et exposition' }).click()
      await expect(page.getByRole('dialog', { name: 'Outils de la carte' })).toBeHidden()
      await expect(page.getByText('Touchez la carte', { exact: false })).toBeVisible()
    })
  })
}
