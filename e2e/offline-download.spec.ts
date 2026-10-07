import { colorsClose, dominantColor } from './support/pixels'
import { TILE_COLOR } from './support/mockMapBackend'
import { expect, test } from './support/test'

/**
 * Downloading an area must be honest: tile failures show up as an
 * "Incomplète" result with counts (never as "Terminée"), and retrying once
 * the failures are gone reuses what is cached and ends "Terminée".
 * The provider is SIMULATED (see support/mockMapBackend.ts): this proves the
 * app's ledger / retry / status logic, not real MapTiler/Esri coverage.
 */
test.describe('téléchargement de zone hors ligne', () => {
  // A small viewport frames a small area: few sweep steps, so the test stays fast
  // and does not depend on how quickly a CI runner renders each step.
  test.use({ viewport: { width: 360, height: 480 } })

  test('échecs de tuiles : zone incomplète avec compteurs, puis reprise réussie', async ({
    page,
    backend,
  }) => {
    test.setTimeout(240_000)
    const canvas = page.locator('canvas.maplibregl-canvas')
    const hybrid = TILE_COLOR['esri-imagery'] ?? [0, 0, 0]

    await page.goto('map')
    await expect(canvas).toBeVisible()
    await expect
      .poll(async () => colorsClose(await dominantColor(page, canvas), hybrid), {
        timeout: 20_000,
      })
      .toBe(true)

    await page.getByRole('button', { name: 'Outils' }).click()
    await page.getByRole('button', { name: 'Télécharger cette zone hors ligne' }).click()

    // The panel explains what a download is — and what "Terminée" does not mean.
    await expect(
      page.getByText('pas une garantie de couverture', { exact: false }),
    ).toBeVisible()
    // Keep the sweep short: current zoom level only (default is +2).
    await page.getByRole('button', { name: 'Moins de niveaux de zoom' }).click()
    await page.getByRole('button', { name: 'Moins de niveaux de zoom' }).click()

    // The provider refuses (HTTP 503) every tile with an even x+y that is not cached yet.
    const failing = (url: URL) => {
      const m = /\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(url.pathname)
      return m !== null && (Number(m[2]) + Number(m[3])) % 2 === 0
    }
    backend.failTiles(failing)
    await page.getByRole('button', { name: 'Lancer le téléchargement' }).click()

    const banner = page.getByRole('status').filter({ hasText: 'Zone hors ligne 1' })
    await expect(banner).toContainText('Incomplète', { timeout: 120_000 })
    await expect(banner).toContainText(/requêtes? réussies?/)
    await expect(banner).toContainText(/[1-9]\d* échecs?/)
    await expect(banner).not.toContainText('Terminée')
    expect(backend.failedTiles()).toBeGreaterThan(0)

    // Failures lifted: retry the SAME area; cached tiles are reused.
    backend.failTiles(null)
    const servedBefore = backend.served().tile
    await banner.getByRole('button', { name: 'Réessayer le téléchargement' }).click()

    const done = page.getByRole('status').filter({ hasText: 'Zone hors ligne 1' })
    await expect(done).toContainText('Terminée', { timeout: 120_000 })
    await expect(done).toContainText('0 échec')
    await expect(done).toContainText('pas une garantie de couverture')
    expect(backend.served().tile).toBeGreaterThan(servedBefore)

    // The result card is a persistent overlay: close it to reach the navigation.
    await done
      .getByRole('button', { name: 'Fermer le résultat du téléchargement' })
      .click()

    // One area only (retry reused the record), listed as complete in Réglages.
    await page.getByRole('link', { name: /Réglages/ }).click()
    await expect(page.getByText('Zone hors ligne 1')).toHaveCount(1)
    await expect(page.getByText('Terminée', { exact: true })).toBeVisible()
    await expect(page.getByText('Zone hors ligne 2')).toHaveCount(0)
  })
})
