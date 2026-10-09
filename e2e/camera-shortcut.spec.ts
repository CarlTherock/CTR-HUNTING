import { expectReachable } from './support/reachable'
import { installFakeCamera } from './support/fakeCamera'
import { expect, test } from './support/test'

/** Raccourci goutte de sang sur le rail de la carte. Chromium, caméra simulée :
 * ne valide pas un iPhone réel. */
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
    test('entre « + Repère » et 2D, atteignable, ouvre la caméra', async ({
      page,
      backend,
    }) => {
      void backend
      await installFakeCamera(page)
      await page.goto('map')
      await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
      await expectReachable(page, [
        'Ajouter un repère',
        'Raccourci : caméra de recherche',
        '2D',
        '3D',
        'Outils',
      ])
      const y = async (name: string) =>
        (await page.getByRole('button', { name, exact: true }).first().boundingBox())
          ?.y ?? 0
      const x = async (name: string) =>
        (await page.getByRole('button', { name, exact: true }).first().boundingBox())
          ?.x ?? 0
      const repere = 'Ajouter un repère'
      const drop = 'Raccourci : caméra de recherche'
      if (size.h > 480) {
        expect(await y(repere)).toBeLessThan(await y(drop))
        expect(await y(drop)).toBeLessThan(await y('2D'))
      } else {
        expect(await x(repere)).toBeLessThan((await x(drop)) + 1)
      }
      if (process.env.E2E_SCREENSHOTS === '1')
        await page.screenshot({
          path: `docs/validation/camera-raccourci-${size.w}x${size.h}.png`,
        })
      await page.getByRole('button', { name: drop }).click()
      await expect(page.getByTestId('blood-camera')).toBeVisible()
      await page.getByRole('button', { name: 'Fermer la caméra' }).click()
      await expect(page.getByTestId('blood-camera')).toHaveCount(0)
    })
  })
}
