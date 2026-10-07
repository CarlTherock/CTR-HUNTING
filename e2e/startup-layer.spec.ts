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
})
