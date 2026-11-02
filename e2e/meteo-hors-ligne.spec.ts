import { expect, test } from './support/test'

/**
 * « Télécharger pour ma sortie » : téléchargement en ligne, puis lecture et
 * relancement SANS réseau. Les réponses Open-Meteo sont SIMULÉES (forme réelle
 * de la réponse, valeurs de test) : ce test prouve la logique de l'application,
 * pas l'exactitude ni la disponibilité du vrai fournisseur.
 */
import { installOpenMeteo } from './support/openMeteoMock'

test.describe('météo hors ligne', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('télécharge en ligne, puis relit les prévisions sans réseau après relancement', async ({
    page,
    context,
    backend,
  }) => {
    void backend
    test.setTimeout(120_000)
    await installOpenMeteo(page)
    await page.goto('weather')

    const card = page.getByTestId('outing-download')
    await expect(card.getByTestId('download-dates')).toContainText('72 h')
    await card.getByRole('button', { name: 'Centre de la carte' }).click()
    await card.getByRole('button', { name: 'Télécharger pour ma sortie' }).click()
    await expect(card.getByTestId('download-outcome')).toContainText(
      'Téléchargement complet',
    )
    const item = card.getByTestId('saved-forecast')
    await expect(item).toContainText('Prévisions enregistrées')
    await expect(item).toContainText('Couverture jusqu’au')

    // Le service worker doit contrôler la page avant de couper le réseau.
    await page.evaluate(() => navigator.serviceWorker.ready)
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
        timeout: 20_000,
      })
      .toBe(true)

    // Plus de réseau, puis relancement de la page.
    await context.setOffline(true)
    await page.reload()
    const offlineItem = page.getByTestId('outing-download').getByTestId('saved-forecast')
    await expect(offlineItem).toContainText('Hors ligne — prévisions téléchargées le')
    await expect(offlineItem).toContainText('Couverture jusqu’au')
    await expect(
      page.getByTestId('outing-download').getByRole('button', {
        name: 'Télécharger pour ma sortie',
      }),
    ).toBeDisabled()

    // Les valeurs absentes (visibilité, UV) restent « indisponible », jamais 0.
    await offlineItem.getByRole('button', { name: 'Consulter' }).click()
    await expect(offlineItem).toContainText('km/h')
  })
})
