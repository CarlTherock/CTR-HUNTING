import {
  applySafeArea,
  IPHONE_LANDSCAPE_SAFE_AREA,
  IPHONE_PORTRAIT_SAFE_AREA,
  measureLayout,
} from './support/layout'
import { colorsClose, dominantColor } from './support/pixels'
import { TILE_COLOR } from './support/mockMapBackend'
import { VIEWPORTS } from './support/viewports'
import { expect, test } from './support/test'

/**
 * Layout of the map page at the required viewports, with the iPhone
 * safe-area insets emulated (Chromium only; WebKit/real devices are NOT
 * covered by this file — see docs/VALIDATION.md).
 *
 * Failure here means a control is off-screen, covered, too small to tap,
 * the page itself scrolls, or the canvas does not match its container —
 * exactly the symptoms of the reported mobile bug.
 */
for (const viewport of VIEWPORTS) {
  test.describe(`carte ${viewport.name}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.mobile,
      isMobile: viewport.mobile,
      deviceScaleFactor: viewport.mobile ? 2 : 1,
    })

    test.beforeEach(async ({ context, page, backend }) => {
      void backend
      if (viewport.mobile && viewport.width < 768) {
        await applySafeArea(
          context,
          page,
          viewport.width > viewport.height
            ? IPHONE_LANDSCAPE_SAFE_AREA
            : IPHONE_PORTRAIT_SAFE_AREA,
        )
      }
      await page.goto('map')
      const canvas = page.locator('canvas.maplibregl-canvas')
      await expect(canvas).toBeVisible()
      const green = TILE_COLOR.outdoor ?? [0, 0, 0]
      await expect
        .poll(async () => colorsClose(await dominantColor(page, canvas), green), {
          timeout: 20_000,
        })
        .toBe(true)
    })

    test('aucun défilement de page, carte = conteneur, contrôles visibles et utilisables', async ({
      page,
    }) => {
      const m = await measureLayout(page)

      // The page itself must not scroll in either direction.
      expect(m.document.scrollWidth, 'défilement horizontal').toBeLessThanOrEqual(
        m.document.clientWidth,
      )
      expect(m.document.scrollHeight, 'défilement vertical').toBeLessThanOrEqual(
        m.document.clientHeight,
      )

      // The canvas matches its container (minus the optional 1px border).
      const container = m.rects.mapContainer
      const canvas = m.rects.canvas
      expect(container && canvas).toBeTruthy()
      if (container && canvas) {
        expect(Math.abs(canvas.width - container.width)).toBeLessThanOrEqual(2)
        expect(Math.abs(canvas.height - container.height)).toBeLessThanOrEqual(2)
        expect(container.height, 'la carte a une hauteur utile').toBeGreaterThan(
          Math.min(200, m.viewport.innerHeight * 0.4),
        )
        expect(container.y + container.height).toBeLessThanOrEqual(
          m.viewport.innerHeight + 1,
        )
        expect(container.x + container.width).toBeLessThanOrEqual(
          m.viewport.innerWidth + 1,
        )
      }

      // Every rendered control is inside the viewport and not covered.
      const problems = m.controls
        .filter((c) => !c.inViewport || !c.hit)
        .map(
          (c) =>
            `${c.label} ${JSON.stringify(c.rect)} dansViewport=${c.inViewport} touchable=${c.hit}`,
        )
      expect(problems, 'contrôles hors écran ou masqués').toEqual([])

      // Touch targets >= 44px (attribution links are legal text, not controls).
      if (viewport.mobile) {
        const small = m.controls
          .filter(
            (c) =>
              c.minSide < 44 && !/maplibre|openstreetmap|maptiler|esri|©/i.test(c.label),
          )
          .map(
            (c) => `${c.label} ${Math.round(c.rect.width)}x${Math.round(c.rect.height)}`,
          )
        expect(small, 'cibles tactiles < 44 px').toEqual([])
      }

      // Evidence for the PR: `E2E_SCREENSHOTS=1 npm run e2e` rewrites docs/validation/apres-*.png.
      if (process.env.E2E_SCREENSHOTS === '1') {
        const slug = viewport.name.split(' ')[0] ?? viewport.name
        await page.screenshot({ path: `docs/validation/apres-${slug}.png` })
      }
    })
  })
}
