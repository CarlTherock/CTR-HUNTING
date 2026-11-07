import { expect, test } from './support/test'

/**
 * « Repères saisonniers du rut » — page de contexte documentaire (aucune donnée simulée de
 * terrain). Vérifie le contenu honnête et le fonctionnement hors ligne dans Chromium, pas sur iPhone.
 */
const SHOTS = process.env.HUNT_SHOTS

test.describe('Repères saisonniers du rut', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('deux bandes séparées, mention non calibrée, état vide, hors ligne', async ({
    page,
    context,
    backend,
  }) => {
    void backend
    await page.goto('rut')
    await expect(
      page.getByRole('heading', {
        name: /Repères saisonniers du rut — contexte québécois/,
      }),
    ).toBeVisible()
    await expect(page.getByTestId('rut-band-quebec')).toBeVisible()
    await expect(page.getByTestId('rut-band-wisconsin')).toBeVisible()
    await expect(
      page.getByText(/Étude externe — non calibrée pour le Québec/),
    ).toBeVisible()
    await expect(page.getByTestId('rut-observations')).toContainText(/Aucune observation/)
    await expect(page.getByText(/6 novembre au 17 décembre/)).toHaveCount(0)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/rut-1.png`, fullPage: true })
    await context.setOffline(true)
    await expect(page.getByTestId('rut-report')).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflow).toBe(false)
  })
})
