import { installAnalysisProviders } from './support/analysisProviders'
import { stubGps } from './support/browserStubs'
import { measureLayout } from './support/layout'
import { expect, test } from './support/test'
import { createWaypointViaUi } from './support/waypointData'

/**
 * Comparateur de caches : créer 3 points, les cocher, comparer, voir les
 * données manquantes, puis « Aller à ».
 *
 * SIMULÉ : Open-Meteo et Overpass sont des fixtures (`analysisProviders.ts`)
 * à la vraie FORME des réponses, le GPS est un récepteur simulé et le fond
 * de carte est le faux backend. On prouve la logique de l'application
 * (regroupement des requêtes, données manquantes, actions, mise en page),
 * jamais l'exactitude des services réels ni un GPS physique.
 */

test.describe('comparateur de caches', () => {
  test('compare 3 points avec des requêtes groupées, montre les manques, puis « Aller à »', async ({
    page,
    backend,
  }) => {
    void backend
    const counts = await installAnalysisProviders(page)
    await stubGps(page, {
      kind: 'fix',
      lat: 46.8139,
      lng: -71.208,
      accuracy: 6,
      ageMs: 0,
    })

    await page.goto('map')
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
    await createWaypointViaUi(page, 'Poste A', { x: 300, y: 250 })
    await createWaypointViaUi(page, 'Poste B', { x: 420, y: 330 })
    await createWaypointViaUi(page, 'Poste C', { x: 330, y: 420 })

    await page
      .getByRole('link', { name: /Points de repère/ })
      .first()
      .click()
    await expect(
      page.getByRole('heading', { name: /Points de repère \(3\)/ }),
    ).toBeVisible()

    const compare = page.getByRole('button', { name: /^Comparer \(\d\)/ })
    await expect(compare).toBeDisabled()
    for (const name of ['Poste A', 'Poste B', 'Poste C']) {
      const box = page.getByRole('checkbox', { name: `Comparer : ${name}` })
      const rect = await box.locator('xpath=ancestor::label').boundingBox()
      expect(rect?.width).toBeGreaterThanOrEqual(44)
      expect(rect?.height).toBeGreaterThanOrEqual(44)
      await box.check()
    }
    await expect(compare).toBeEnabled()
    await compare.click()

    const panel = page.getByRole('region', { name: 'Comparaison de caches' })
    await expect(panel).toBeVisible()
    await expect(
      panel.getByText('Comparaison indicative : ce n’est pas une prévision de réussite.'),
    ).toBeVisible()
    await expect(panel.getByText('Vent et météo : requête groupée')).toBeVisible()

    // Une seule grille de vent et une seule requête de végétation pour 3 points.
    expect(counts.wind).toBe(1)
    expect(counts.overpass).toBe(1)

    // Les données manquantes sont dites : pas de direction préférée ni de signe de gibier.
    await expect(panel.getByText('Couverture', { exact: true }).first()).toBeVisible()
    await expect(
      panel.getByText(/Directions de vent préférées : non enregistrées/).first(),
    ).toBeVisible()
    await expect(
      panel.getByText(/Signes de gibier : aucun enregistré/).first(),
    ).toBeVisible()
    await expect(panel.getByText(/critères évaluables/).first()).toBeVisible()

    // Changer d'heure ne fait aucune requête.
    const select = panel.getByLabel(/Créneau horaire/)
    const options = await select.locator('option').count()
    expect(options).toBeGreaterThan(1)
    await select.selectOption({ index: options - 1 })
    expect(counts.wind).toBe(1)
    expect(counts.overpass).toBe(1)

    // Aucun débordement horizontal de la page, sur grand écran puis en mobile.
    for (const size of [
      { width: 1440, height: 900 },
      { width: 768, height: 1024 },
      { width: 430, height: 932 },
      { width: 390, height: 844 },
      { width: 375, height: 812 },
      { width: 320, height: 568 },
      { width: 844, height: 390 },
      { width: 568, height: 320 },
    ]) {
      await page.setViewportSize(size)
      const m = await measureLayout(page)
      expect(m.document.scrollWidth, `${size.width}x${size.height}`).toBeLessThanOrEqual(
        m.document.clientWidth,
      )
    }
    // En mobile : cartes empilées.
    await page.setViewportSize({ width: 375, height: 812 })
    await expect(panel.getByTestId('compare-cards')).toBeVisible()
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(panel.getByRole('table')).toBeVisible()

    // Distance depuis ma position (GPS simulé frais).
    await expect(panel.getByText(/à vol d’oiseau/).first()).toBeVisible()

    // « Aller à » démarre le guidage existant sur la carte.
    await panel.getByRole('button', { name: 'Aller à' }).first().click()
    await expect(page).toHaveURL(/\/map$/)
    await expect(page.getByTestId('guidance-panel')).toBeVisible()
  })
})
