import {
  applySafeArea,
  IPHONE_LANDSCAPE_SAFE_AREA,
  IPHONE_PORTRAIT_SAFE_AREA,
} from './support/layout'
import { createWaypointViaUi } from './support/waypointData'
import { expect, test } from './support/test'

/**
 * Evidence screenshots of the new panels (waypoint sheet, guidance panel).
 * Only runs with E2E_SCREENSHOTS=1. SIMULATED provider data, GPS and compass,
 * Chromium with emulated iPhone safe areas — not a real device.
 */
const SIZES = [
  { name: 'portrait-390x844', width: 390, height: 844, landscape: false },
  { name: 'paysage-844x390', width: 844, height: 390, landscape: true },
]

test.skip(
  process.env.E2E_SCREENSHOTS !== '1',
  'captures uniquement avec E2E_SCREENSHOTS=1',
)

for (const size of SIZES) {
  test.describe(`captures ${size.name}`, () => {
    test.use({
      viewport: { width: size.width, height: size.height },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
      permissions: ['geolocation'],
      geolocation: { latitude: 46.8, longitude: -71.2, accuracy: 6 },
    })

    test('fiche du waypoint puis guidage', async ({ page, context, backend }) => {
      void backend
      await applySafeArea(
        context,
        page,
        size.landscape ? IPHONE_LANDSCAPE_SAFE_AREA : IPHONE_PORTRAIT_SAFE_AREA,
      )
      await page.goto('map')
      await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
      const box = await page.locator('canvas.maplibregl-canvas').boundingBox()
      if (!box) throw new Error('no canvas')
      await createWaypointViaUi(page, 'Mirador nord', {
        x: Math.round(box.width / 2) - 40,
        y: Math.round(box.height / 2) - 40,
      })
      await page.getByTestId('waypoint-marker').first().click()
      await expect(page.getByText('Position du waypoint')).toBeVisible()
      await page.screenshot({ path: `docs/validation/panneau-fiche-${size.name}.png` })

      await page.getByRole('button', { name: 'Aller à', exact: true }).click()
      await expect(page.getByTestId('guidance-panel')).toBeVisible()
      await context.setGeolocation({ latitude: 46.799, longitude: -71.205, accuracy: 6 })
      await expect(page.getByTestId('guidance-distance')).toContainText(/m|km/)
      await page.screenshot({ path: `docs/validation/panneau-guidage-${size.name}.png` })
    })
  })
}
