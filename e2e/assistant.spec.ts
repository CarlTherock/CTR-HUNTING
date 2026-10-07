import { measureLayout } from './support/layout'
import { expect, test } from './support/test'
import { VIEWPORTS } from './support/viewports'
import { createWaypointViaUi } from './support/waypointData'

/**
 * Assistant déterministe (phase 14) : créer des données, résumer le
 * territoire, rechercher, ouvrir un résultat; puis mise en page aux
 * viewports requis. Chromium + fond de carte simulé. Aucune IA générative :
 * rien n'est envoyé, le test vérifie aussi qu'aucune requête ne part vers un
 * service d'IA.
 */

test.describe('assistant : parcours complet', () => {
  test('créer des données, résumer, rechercher, ouvrir un résultat', async ({
    page,
    backend,
  }) => {
    void backend
    const aiRequests: string[] = []
    page.on('request', (request) => {
      if (/anthropic|openai|generativelanguage/i.test(request.url())) {
        aiRequests.push(request.url())
      }
    })

    await page.goto('map')
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
    await createWaypointViaUi(
      page,
      'Poste du nord',
      { x: 200, y: 250 },
      'Bon vent du nord',
    )
    await createWaypointViaUi(page, 'Cache libre', { x: 90, y: 330 })

    await page.goto('assistant')
    await expect(page.getByRole('heading', { name: /Assistant/ }).first()).toBeVisible()
    await expect(page.getByTestId('generative-status')).toContainText(
      'Assistant génératif : non activé',
    )

    // Résumé : comptes réels, étiquette « Calcul / résumé automatique ».
    await page.getByRole('tab', { name: 'Résumer un territoire' }).click()
    const summary = page.getByTestId('assistant-result')
    await expect(summary).toBeVisible()
    await expect(summary.getByTestId('origin-badge')).toContainText(
      'Calcul / résumé automatique',
    )
    await expect(summary).toContainText('2 points de repère')

    // Recherche : texte présent dans une note.
    await page.getByRole('tab', { name: 'Rechercher l’historique' }).click()
    await page.getByLabel('Texte dans le nom ou la note').fill('vent')
    await page.getByRole('button', { name: 'Rechercher', exact: true }).click()
    const found = page.getByTestId('assistant-result')
    await expect(found).toContainText('Poste du nord')
    await expect(found).not.toContainText('Cache libre')

    // Ouvrir le résultat : la fiche du point de repère s'ouvre.
    await found.getByTestId('ref-open').first().click()
    await expect(page).toHaveURL(/\/waypoints$/)
    await expect(page.getByLabel('Nom')).toHaveValue('Poste du nord')

    expect(aiRequests).toEqual([])
  })
})

for (const viewport of [
  ...VIEWPORTS,
  { name: '568x320 (paysage)', width: 568, height: 320, mobile: true },
]) {
  test.describe(`assistant ${viewport.name}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.mobile,
      isMobile: viewport.mobile,
      deviceScaleFactor: viewport.mobile ? 2 : 1,
    })

    for (const tool of [
      'Résumer un territoire',
      'Rechercher l’historique',
      'Comparer des périodes',
      'Expliquer une analyse',
      'Comparer des caches',
    ]) {
      test(`${tool} : pas de défilement horizontal, cibles d’au moins 44 px`, async ({
        page,
        backend,
      }) => {
        void backend
        await page.goto('assistant')
        await page.getByRole('tab', { name: tool }).click()
        await expect(page.getByRole('tabpanel')).toBeVisible()
        const layout = await measureLayout(page, 'main')
        expect(layout.document.scrollWidth).toBeLessThanOrEqual(
          layout.document.clientWidth,
        )
        // Cases à cocher : la cible est le libellé (min-h-11), pas la case.
        const small = await page
          .locator('main')
          .locator(
            'button, select, [role="tab"], input:not([type="checkbox"]):not([type="radio"])',
          )
          .evaluateAll((elements) =>
            elements
              .map((element) => {
                const r = element.getBoundingClientRect()
                return {
                  label: (element.getAttribute('aria-label') ?? element.textContent ?? '')
                    .trim()
                    .slice(0, 40),
                  side: Math.min(r.width, r.height),
                  shown: r.width > 0 && r.height > 0,
                }
              })
              .filter((c) => c.shown && c.side < 43.5),
          )
        expect(small).toEqual([])
      })
    }
  })
}
