import { expect, test } from './support/test'
import { installOpenMeteo } from './support/openMeteoMock'

/**
 * Page Météo : jours, carte principale, soleil et heures de chasse, heures
 * sélectionnables, sans débordement horizontal. Réponses Open-Meteo SIMULÉES.
 */
for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
]) {
  test.describe(`page Météo ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport })

    test('structure, règle de chasse choisie par la personne, aucune barre horizontale', async ({
      page,
      backend,
    }) => {
      void backend
      test.setTimeout(90_000)
      await installOpenMeteo(page)
      await page.goto('weather')

      await expect(page.getByTestId('main-weather')).toBeVisible()
      await expect(
        page.getByRole('group', { name: 'Jour de la prévision météo' }),
      ).toBeVisible()
      await expect(page.getByTestId('weather-place')).toContainText('Centre de la carte')

      const card = page.getByTestId('sun-hunting')
      await card.scrollIntoViewIfNeeded()
      await expect(card.getByTestId('sunrise')).toHaveText(/^\d\d:\d\d$/)
      await expect(card.getByTestId('no-window')).toBeVisible()
      await page.screenshot({
        path: test.info().outputPath('meteo-soleil-sans-regle.png'),
      })

      await card.getByRole('button', { name: /Je chasse au Québec/ }).click()
      await expect(card.getByTestId('window-start')).toHaveText(/\d\d:\d\d/)
      await expect(card.getByTestId('window-end')).toHaveText(/\d\d:\d\d/)
      await expect(card).not.toContainText(/chasse autorisée/i)
      await page.screenshot({ path: test.info().outputPath('meteo-plage-calculee.png') })

      // Une heure choisie : la ligne est marquée sélectionnée.
      const hour = page.getByRole('button', {
        name: '15:00 : voir le vent de cette heure',
      })
      await hour.scrollIntoViewIfNeeded()
      await hour.click()
      await expect(hour).toHaveAttribute('aria-pressed', 'true')

      // Pas de défilement horizontal de la page.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)
    })
  })
}
