import { colorsClose, dominantColor } from './support/pixels'
import { TILE_COLOR } from './support/mockMapBackend'
import { expect, test } from './support/test'

/**
 * The map must open on the hybrid satellite view (Esri Imagery Hybrid when
 * its key is configured) — proven by the pixels of the canvas, not by the
 * label of a button — and the user must be able to change it afterwards.
 * Provider responses are SIMULATED (distinct colour per style).
 */
test.describe('couche de départ', () => {
  test('démarre en satellite hybride puis le choix utilisateur est respecté', async ({
    page,
    backend,
  }) => {
    const canvas = page.locator('canvas.maplibregl-canvas')
    const hybrid = TILE_COLOR['esri-imagery'] ?? [0, 0, 0]
    const satellite = TILE_COLOR.satellite ?? [0, 0, 0]

    await page.goto('map')
    await expect(canvas).toBeVisible()
    await expect
      .poll(async () => colorsClose(await dominantColor(page, canvas), hybrid), {
        timeout: 20_000,
      })
      .toBe(true)
    expect(backend.styleRequests()).toContain('esri-imagery')

    // The layer panel is collapsed at startup.
    await expect(page.getByRole('radio', { name: 'Imagerie hybride' })).toHaveCount(0)

    // Changing the layer in-session works (and checks the other vendor).
    await page.getByRole('button', { name: 'Couches' }).click()
    await expect(page.getByRole('radio', { name: 'Imagerie hybride' })).toBeChecked()
    await page.getByRole('radio', { name: 'Satellite' }).click()
    await expect
      .poll(async () => colorsClose(await dominantColor(page, canvas), satellite), {
        timeout: 20_000,
      })
      .toBe(true)

    // Overlays only exist on the Outdoor style: say so visibly instead of a tooltip.
    await page.getByRole('button', { name: 'Couches' }).click()
    await expect(
      page.getByText('ne sont disponibles qu’avec le fond', { exact: false }),
    ).toBeVisible()
    await expect(page.getByRole('checkbox', { name: 'Sentiers' })).toBeDisabled()
  })

  test('aller-retour entre pages : le fond choisi est conservé ; démarrage à froid : hybride', async ({
    page,
    backend,
  }) => {
    void backend
    const canvas = page.locator('canvas.maplibregl-canvas')
    const hybrid = TILE_COLOR['esri-imagery'] ?? [0, 0, 0]
    const satellite = TILE_COLOR.satellite ?? [0, 0, 0]
    const showing = (color: readonly [number, number, number]) =>
      expect
        .poll(async () => colorsClose(await dominantColor(page, canvas), color), {
          timeout: 20_000,
        })
        .toBe(true)

    // Old preferences from any earlier version must have no effect.
    await page.addInitScript(() => {
      localStorage.setItem('baseLayer', 'outdoor')
      localStorage.setItem(
        'layers-storage',
        JSON.stringify({ state: { baseLayer: 'outdoor' }, version: 0 }),
      )
    })

    await page.goto('map')
    await showing(hybrid)

    await page.getByRole('button', { name: 'Couches' }).click()
    await page.getByRole('radio', { name: 'Satellite' }).click()
    await showing(satellite)

    // Leave the map page and come back (client-side navigation).
    await page.getByRole('link', { name: 'Points de repère et traces' }).click()
    await expect(
      page.getByRole('heading', { name: 'Points de repère et traces' }),
    ).toBeVisible()
    await page.getByRole('link', { name: /^Carte/ }).click()
    await expect(canvas).toBeVisible()
    await showing(satellite)

    // Cold launch (new JavaScript session): back to the hybrid default.
    await page.reload()
    await expect(canvas).toBeVisible()
    await showing(hybrid)
  })

  test('style hybride indisponible : repli explicite sur Satellite', async ({
    page,
    backend,
  }) => {
    backend.failStyle('esri-imagery')
    const canvas = page.locator('canvas.maplibregl-canvas')
    const satellite = TILE_COLOR.satellite ?? [0, 0, 0]

    await page.goto('map')
    await expect(page.getByRole('status')).toContainText('Imagerie hybride')
    await expect(page.getByRole('status')).toContainText('repli sur « Satellite »')
    await expect
      .poll(async () => colorsClose(await dominantColor(page, canvas), satellite), {
        timeout: 20_000,
      })
      .toBe(true)
    expect(backend.styleRequests()).toContain('esri-imagery')
    expect(backend.styleRequests()).toContain('satellite')
  })
})
