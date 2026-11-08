import {
  applySafeArea,
  IPHONE_LANDSCAPE_SAFE_AREA,
  IPHONE_PORTRAIT_SAFE_AREA,
  measureLayout,
} from './support/layout'
import { colorsClose, dominantColor } from './support/pixels'
import type { Rgb } from './support/png'
import { TILE_COLOR } from './support/mockMapBackend'
import { VIEWPORTS } from './support/viewports'
import { expect, test } from './support/test'

/** Chromium avec zones sûres simulées : ni WebKit ni validation sur iPhone physique. */
for (const viewport of VIEWPORTS) {
  test.describe(`carte ${viewport.name}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.mobile,
      isMobile: viewport.mobile,
      deviceScaleFactor: viewport.mobile ? 2 : 1,
    })

    test.beforeEach(async ({ context, page, backend }, testInfo) => {
      const pageErrors: string[] = []
      const consoleErrors: string[] = []
      page.on('pageerror', (error) => pageErrors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text())
      })
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
      const expected = TILE_COLOR['esri-imagery'] ?? [0, 0, 0]
      let lastObserved: Rgb | null = null
      try {
        await expect.poll(async () => {
          const observed = await dominantColor(page, canvas)
          lastObserved = observed
          return {
            rendered: colorsClose(observed, expected),
            observed,
            expected,
            stylesRequested: backend.styleRequests(),
            served: backend.served(),
            refused: backend.refused(),
            failedTiles: backend.failedTiles(),
            unexpectedHosts: backend.unexpectedHosts(),
            pageErrors: [...pageErrors],
            consoleErrors: [...consoleErrors],
          }
        }, {
          timeout: 20_000,
          message: 'Le fond satellite simulé doit réellement être rendu ; les diagnostics ne remplacent pas cette exigence.',
        }).toMatchObject({ rendered: true })
      } catch (error) {
        const browser = await page.evaluate(() => {
          const element = document.querySelector<HTMLCanvasElement>('canvas.maplibregl-canvas')
          const r = element?.getBoundingClientRect()
          return {
            viewport: { width: window.innerWidth, height: window.innerHeight },
            canvas: element ? { width: element.width, height: element.height, rect: r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null } : null,
            serviceWorkerControlled: 'serviceWorker' in navigator && navigator.serviceWorker.controller !== null,
          }
        }).catch(() => null)
        await testInfo.attach('map-render-diagnostic.json', {
          body: JSON.stringify({
            viewport, expected, observed: lastObserved, browser,
            stylesRequested: backend.styleRequests(), served: backend.served(),
            refused: backend.refused(), failedTiles: backend.failedTiles(),
            unexpectedHosts: backend.unexpectedHosts(), pageErrors, consoleErrors,
          }, null, 2),
          contentType: 'application/json',
        }).catch(() => undefined)
        await page.screenshot({ path: testInfo.outputPath('map-render-failure.png') }).catch(() => undefined)
        throw error
      }
    })

    test('aucun défilement de page, carte = conteneur, contrôles visibles et utilisables', async ({
      page,
    }) => {
      const m = await measureLayout(page)
      expect(m.document.scrollWidth, 'défilement horizontal').toBeLessThanOrEqual(
        m.document.clientWidth,
      )
      expect(m.document.scrollHeight, 'défilement vertical').toBeLessThanOrEqual(
        m.document.clientHeight,
      )
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
      const problems = m.controls
        .filter((c) => !c.inViewport || !c.hit)
        .map(
          (c) =>
            `${c.label} ${JSON.stringify(c.rect)} dansViewport=${c.inViewport} touchable=${c.hit}`,
        )
      expect(problems, 'contrôles hors écran ou masqués').toEqual([])
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
      if (process.env.E2E_SCREENSHOTS === '1') {
        const slug = viewport.name.split(' ')[0] ?? viewport.name
        await page.screenshot({ path: `docs/validation/apres-${slug}.png` })
      }
    })
  })
}
