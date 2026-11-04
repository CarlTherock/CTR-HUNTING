import { applySafeArea } from './support/layout'
import { expect, test } from './support/test'

/**
 * Barre d'icônes verticale de la carte sur un écran d'iPhone 16 (393×852) :
 * tous les boutons — dont « Mode immersif », le dernier — doivent rester sur
 * UNE seule colonne (pas de 2e colonne qui replie le bouton en haut).
 * Chromium UNIQUEMENT, carte et GPS simulés : ceci ne remplace pas un iPhone réel.
 */
// iPhone 16 : encoche (Dynamic Island) de 59 pt en haut, barre d'accueil de 34 pt en bas.
const IPHONE_16_SAFE_AREA = { top: 59, bottom: 34, left: 0, right: 0 }

test.describe('barre d’icônes de la carte — iPhone 16 portrait', () => {
  test.use({
    viewport: { width: 393, height: 852 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  })

  test('tous les boutons du rail sont alignés sur une seule colonne, immersif en bas', async ({
    context,
    page,
    backend,
  }) => {
    void backend
    await applySafeArea(context, page, IPHONE_16_SAFE_AREA)
    await page.goto('map')
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
    const immersive = page.getByRole('button', { name: 'Mode immersif' })
    await expect(immersive).toBeVisible()

    const boxes = await page
      .getByTestId('map-tool-rail')
      .locator('button')
      .evaluateAll((buttons) =>
        buttons.map((button) => {
          const rect = button.getBoundingClientRect()
          return {
            label: button.getAttribute('aria-label') ?? button.textContent ?? '',
            right: Math.round(rect.right),
            bottom: Math.round(rect.bottom),
          }
        }),
      )
    expect(boxes.length).toBeGreaterThan(5)
    // Même colonne = bords droits identiques, à 2 px près (arrondis de rendu).
    // « Ajouter un repère » est le gros bouton vert, plus large : hors colonne d'icônes.
    const column = boxes.filter((box) => box.label !== 'Ajouter un repère')
    const rights = column.map((box) => box.right)
    expect(
      Math.max(...rights) - Math.min(...rights),
      JSON.stringify(boxes),
    ).toBeLessThanOrEqual(2)
    const lowest = column.reduce((a, b) => (b.bottom > a.bottom ? b : a))
    expect(lowest.label).toBe('Mode immersif')
  })
})
