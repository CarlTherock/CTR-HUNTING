import { readFileSync } from 'node:fs'
import { createWaypointViaUi, readWaypoints } from './support/waypointData'
import { expect, test } from './support/test'

/**
 * Backup and restore through the real UI, with a real file download.
 * The map provider is SIMULATED (see support/mockMapBackend.ts); this proves
 * the app's backup logic in Chromium, NOT the iOS Safari / installed-PWA
 * download behaviour, which must be checked on a physical iPhone.
 */
test.describe('sauvegarde et restauration', () => {
  test('créer un point, sauvegarder (téléchargement), vider, restaurer', async ({
    page,
    backend,
  }, testInfo) => {
    void backend
    await page.goto('map')
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
    const created = await createWaypointViaUi(
      page,
      'Poste E2E',
      { x: 200, y: 200 },
      'notes <b>x</b>',
    )

    await page.goto('settings')
    await expect(page.getByText('Sauvegarde externe')).toBeVisible()

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Sauvegarder maintenant' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(
      /^ctr-hunting-sauvegarde-\d{4}-\d{2}-\d{2}-\d{4}\.zip$/,
    )
    const file = testInfo.outputPath('sauvegarde.zip')
    await download.saveAs(file)
    await expect(page.getByText(/Fichier créé/)).toBeVisible()

    // Wipe the waypoints store, as if the site data had been cleared.
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('field-terrain-intelligence')
          open.onerror = () => reject(open.error)
          open.onsuccess = () => {
            const tx = open.result.transaction('waypoints', 'readwrite')
            tx.objectStore('waypoints').clear()
            tx.oncomplete = () => resolve()
            tx.onerror = () => reject(tx.error)
          }
        }),
    )
    expect(await readWaypoints(page)).toHaveLength(0)

    // Selecting the file: Playwright's own setInputFiles did not reach the
    // React onChange of this hidden input in Chromium here (cause not
    // established), so the real downloaded bytes are handed to the input
    // through DataTransfer + a change event. The OS file picker itself is NOT
    // exercised (check it on a physical iPhone).
    const zipBase64 = readFileSync(file).toString('base64')
    await page.evaluate((b64) => {
      const input = document.querySelector<HTMLInputElement>(
        'input[aria-label="Fichier de sauvegarde à restaurer"]',
      )
      if (!input) throw new Error('input de restauration introuvable')
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const transfer = new DataTransfer()
      transfer.items.add(new File([bytes], 'sauvegarde.zip', { type: 'application/zip' }))
      input.files = transfer.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }, zipBase64)
    const preview = page.getByRole('region', { name: 'Aperçu de la restauration' })
    await expect(preview).toBeVisible()
    expect(await readWaypoints(page)).toHaveLength(0) // preview wrote nothing
    await preview.getByRole('button', { name: /Restaurer \(ajouter/ }).click()
    await expect(
      page.getByRole('region', { name: 'Rapport de restauration' }),
    ).toContainText('Restauration terminée')

    const restored = await readWaypoints(page)
    expect(restored).toHaveLength(1)
    expect(restored[0].id).toBe(created.id)
    expect(restored[0].coordinate).toEqual(created.coordinate)
    expect(restored[0].notes).toBe('notes <b>x</b>')
  })
})
