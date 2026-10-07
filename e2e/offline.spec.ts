import { colorsClose, dominantColor } from './support/pixels'
import { TILE_COLOR } from './support/mockMapBackend'
import { expect, test } from './support/test'

/**
 * Cold start without any network, after the app was installed and the map
 * was used online. Three DIFFERENT things must work, and one passing does
 * not prove the others:
 *
 *  1. app shell      — HTML/JS/CSS served by the service worker precache;
 *  2. map engine     — MapLibre's worker script + WebGL, also from precache;
 *  3. map content    — style, sprite, glyphs and tiles served from the
 *                      local cache (the base layer that was used online).
 *
 * Everything the provider would answer is SIMULATED (see
 * support/mockMapBackend.ts): this proves the app's caching logic, not that
 * MapTiler/Esri tiles of a real area were downloaded.
 */
test.describe('démarrage à froid hors ligne', () => {
  test('shell, moteur cartographique et contenu de la carte sans réseau', async ({
    page,
    context,
    backend,
  }) => {
    const canvas = page.locator('canvas.maplibregl-canvas')
    const outdoorGreen = TILE_COLOR.outdoor ?? [0, 0, 0]
    const failedEngineRequests: string[] = []
    page.on('requestfailed', (request) => {
      if (request.url().includes('/maplibre/')) failedEngineRequests.push(request.url())
    })

    await test.step('en ligne : la carte affiche de vraies tuiles', async () => {
      await page.goto('map')
      await expect(canvas).toBeVisible()
      await expect
        .poll(async () => colorsClose(await dominantColor(page, canvas), outdoorGreen), {
          timeout: 20_000,
        })
        .toBe(true)
      const served = backend.served()
      expect(served.style).toBeGreaterThan(0)
      expect(served.tile).toBeGreaterThan(0)
    })

    await test.step('le service worker contrôle la page (installation terminée)', async () => {
      await page.evaluate(() => navigator.serviceWorker.ready)
      await expect
        .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
          timeout: 20_000,
        })
        .toBe(true)
    })

    await test.step('coupure réseau', async () => {
      backend.reset()
      backend.setOnline(false)
      await context.setOffline(true)
    })

    await test.step('1. shell disponible hors ligne', async () => {
      await page.reload()
      await expect(page.locator('main')).toBeVisible()
      await expect(page.getByTestId('map-container')).toBeVisible()
    })

    await test.step('2. moteur cartographique disponible hors ligne', async () => {
      await expect(canvas).toBeVisible()
      // A canvas can exist even if MapLibre's worker failed to load, so
      // check the worker itself: it must be in the service-worker cache
      // (precache), and no request for it may have failed while offline.
      const workerCached = await page.evaluate(async () => {
        // Workbox stores precache entries under `url?__WB_REVISION__=…`.
        const response = await caches.match(
          new URL('maplibre/maplibre-gl-worker.mjs', document.baseURI),
          { ignoreSearch: true },
        )
        return (
          response !== undefined &&
          (await response.clone().arrayBuffer()).byteLength > 100_000
        )
      })
      expect(
        workerCached,
        'maplibre-gl-worker.mjs absent du précache du service worker',
      ).toBe(true)
      expect(failedEngineRequests, 'requêtes du moteur en échec hors ligne').toEqual([])
    })

    await test.step('3. contenu de la carte (style + tuiles) hors ligne', async () => {
      await expect
        .poll(async () => colorsClose(await dominantColor(page, canvas), outdoorGreen), {
          timeout: 20_000,
        })
        .toBe(true)
      // Nothing was served by the (unreachable) provider: the pixels above
      // came from the local cache.
      const served = backend.served()
      expect(served.style + served.tile + served.sprite + served.glyph).toBe(0)
    })
  })
})
