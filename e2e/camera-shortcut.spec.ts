import { expectReachable } from './support/reachable'
import { installFakeCamera } from './support/fakeCamera'
import { expect, test } from './support/test'

/** Raccourci goutte de sang sur le rail de la carte. Chromium, caméra simulée :
 * ne valide pas un iPhone réel. En paysage court (≤ 480 px de haut) le
 * raccourci est volontairement absent du rail : un bouton de plus y élargit le
 * rail d'une colonne et écrase le panneau « Aller à » ; la caméra reste dans
 * Outils. */
const DROP = 'Raccourci : caméra de recherche'

for (const size of [
  { w: 390, h: 844 },
  { w: 320, h: 568 },
  { w: 568, h: 320 },
]) {
  test.describe(`raccourci caméra ${size.w}x${size.h}`, () => {
    test.use({
      viewport: { width: size.w, height: size.h },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
      permissions: ['geolocation'],
      geolocation: { latitude: 46.8, longitude: -71.2, accuracy: 6 },
    })
    test(
      size.h <= 480
        ? 'paysage court : pas de raccourci sur le rail, la caméra reste dans Outils'
        : 'entre « + Repère » et 2D, atteignable, ouvre la caméra',
      async ({ page, backend }) => {
        void backend
        await installFakeCamera(page)
        await page.goto('map')
        await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
        if (size.h <= 480) {
          await expect(page.getByRole('button', { name: DROP })).toBeHidden()
          await expectReachable(page, ['Ajouter un repère', '2D', '3D', 'Outils'])
          await page.getByRole('button', { name: 'Outils' }).click()
          await page.getByRole('button', { name: 'Caméra sang' }).click()
          await expect(page.getByTestId('blood-camera')).toBeVisible()
          return
        }
        await expectReachable(page, ['Ajouter un repère', DROP, '2D', '3D', 'Outils'])
        const y = async (name: string) =>
          (await page.getByRole('button', { name, exact: true }).first().boundingBox())
            ?.y ?? 0
        expect(await y('Ajouter un repère')).toBeLessThan(await y(DROP))
        expect(await y(DROP)).toBeLessThan(await y('2D'))
        if (process.env.E2E_SCREENSHOTS === '1')
          await page.screenshot({
            path: `docs/validation/camera-raccourci-${size.w}x${size.h}.png`,
          })
        await page.getByRole('button', { name: DROP }).click()
        await expect(page.getByTestId('blood-camera')).toBeVisible()
        await page.getByRole('button', { name: 'Fermer la caméra' }).click()
        await expect(page.getByTestId('blood-camera')).toHaveCount(0)
      },
    )
  })
}
