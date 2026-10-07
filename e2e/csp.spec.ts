import { colorsClose, dominantColor } from './support/pixels'
import { TILE_COLOR } from './support/mockMapBackend'
import { expect, test } from './support/test'

/**
 * The production build ships a Content-Security-Policy <meta>. A policy that
 * blocks the map is worse than none, so the map must still render real
 * tiles with the policy active and without a single violation. Simulated
 * provider hosts are allowed in this E2E build only (CSP_EXTRA_HOSTS).
 */
test.describe('Content-Security-Policy', () => {
  test('la carte fonctionne sans aucune violation de la politique', async ({
    page,
    backend,
  }) => {
    void backend // installs the simulated provider backend
    const violations: string[] = []
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (event) => {
        ;(window as unknown as { __csp: string[] }).__csp ??= []
        ;(window as unknown as { __csp: string[] }).__csp.push(
          `${event.violatedDirective} ${event.blockedURI}`,
        )
      })
    })
    page.on('console', (message) => {
      if (/Content Security Policy|Content-Security-Policy/i.test(message.text())) {
        violations.push(message.text())
      }
    })

    await page.goto('map')
    const meta = page.locator('meta[http-equiv="Content-Security-Policy"]')
    await expect(meta).toHaveCount(1)
    expect(await meta.getAttribute('content')).toContain("script-src 'self'")

    const canvas = page.locator('canvas.maplibregl-canvas')
    await expect(canvas).toBeVisible()
    const green = TILE_COLOR.outdoor ?? [0, 0, 0]
    await expect
      .poll(async () => colorsClose(await dominantColor(page, canvas), green), {
        timeout: 20_000,
      })
      .toBe(true)

    const fromEvents = await page.evaluate(
      () => (window as unknown as { __csp?: string[] }).__csp ?? [],
    )
    expect([...violations, ...fromEvents]).toEqual([])
  })
})
