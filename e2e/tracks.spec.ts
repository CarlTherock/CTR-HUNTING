import { expect, test } from './support/test'

/**
 * A GPS track must survive the app being closed mid-recording. The device
 * position is SIMULATED (Playwright geolocation override) — this proves the
 * app's persistence and recovery, not real GPS accuracy on an iPhone.
 */
test.describe('traces GPS durables', () => {
  test.use({
    permissions: ['geolocation'],
    geolocation: { latitude: 46.8, longitude: -71.2 },
  })

  test('une trace interrompue est récupérée après rechargement, puis terminée', async ({
    page,
    context,
    backend,
  }) => {
    void backend
    await page.goto('map')
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()

    await page.getByRole('button', { name: 'Outils' }).click()
    await page.getByRole('button', { name: 'Enregistrer une trace GPS' }).click()
    await expect(page.getByText('● Enregistrement')).toBeVisible()

    // Walk ~110 m, twice (each fix farther than the 5 m jitter filter).
    await context.setGeolocation({ latitude: 46.8, longitude: -71.2 })
    await context.setGeolocation({ latitude: 46.801, longitude: -71.2 })
    await context.setGeolocation({ latitude: 46.802, longitude: -71.2 })

    // The points are in IndexedDB before anything closes the recording.
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              new Promise<number>((resolve, reject) => {
                const open = indexedDB.open('field-terrain-intelligence')
                open.onerror = () => reject(open.error)
                open.onsuccess = () => {
                  const tx = open.result.transaction('tracks', 'readonly')
                  const all = tx.objectStore('tracks').getAll()
                  all.onsuccess = () =>
                    resolve(
                      Math.max(
                        0,
                        ...all.result.map((t: { points: unknown[] }) => t.points.length),
                      ),
                    )
                  all.onerror = () => reject(all.error)
                }
              }),
          ),
        { timeout: 15_000 },
      )
      .toBeGreaterThanOrEqual(2)

    // Simulate the app being killed: reload without stopping.
    await page.reload()
    await page.goto('waypoints')

    await expect(page.getByText('Interrompue')).toBeVisible()
    await expect(page.getByText(/points\s+conservés/)).toBeVisible()

    await page.getByRole('button', { name: 'Terminer la trace' }).click()
    await expect(page.getByText('Interrompue')).toBeHidden()

    // Deleting asks for confirmation first.
    await page.getByRole('button', { name: /^Supprimer Trace/ }).click()
    await expect(page.getByRole('alertdialog')).toContainText('irréversible')
    await page.getByRole('button', { name: 'Annuler' }).click()
    await expect(page.getByRole('alertdialog')).toBeHidden()
    await expect(page.getByRole('button', { name: /^Supprimer Trace/ })).toBeVisible()
  })
})
