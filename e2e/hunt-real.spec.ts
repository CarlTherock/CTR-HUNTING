import { expect, test, type Response } from '@playwright/test'

/**
 * Services réels, sans la fixture de carte simulée de support/test.
 * HUNT_REAL=1 npx playwright test e2e/hunt-real.spec.ts
 * Une indisponibilité produit un diagnostic et un test ignoré, pas une validation des données.
 * La présence du canvas ne prouve ni le rendu de toutes les tuiles ni un essai sur iPhone.
 */
test.skip(!process.env.HUNT_REAL, 'HUNT_REAL=1 requis (accès réseau réel)')
test.use({ viewport: { width: 390, height: 844 } })

interface Receipt { host: string; status: number; valid: boolean; detail: string }
const WEATHER = 'api.open-meteo.com'
const LAND = 'overpass-api.de'
async function inspect(response: Response): Promise<Receipt> {
  const host = new URL(response.url()).host
  const status = response.status()
  if (!response.ok()) return { host, status, valid: false, detail: `HTTP ${status}` }
  try {
    const data: unknown = await response.json()
    if (!data || typeof data !== 'object') return { host, status, valid: false, detail: 'JSON non objet' }
    const payload = data as { hourly?: { time?: unknown }; elements?: unknown; remark?: unknown }
    if (host === WEATHER) {
      const valid = Array.isArray(payload.hourly?.time) && payload.hourly.time.length > 0
      return { host, status, valid, detail: valid ? 'série horaire reçue' : 'série horaire absente' }
    }
    const incomplete = typeof payload.remark === 'string' && /error|timed out|out of memory/i.test(payload.remark)
    const valid = Array.isArray(payload.elements) && !incomplete
    return { host, status, valid, detail: incomplete ? String(payload.remark).slice(0, 180) : valid ? `${(payload.elements as unknown[]).length} éléments OSM reçus` : 'éléments OSM absents' }
  } catch {
    return { host, status, valid: false, detail: 'réponse JSON illisible' }
  }
}

test('services réels : données reçues, couverture du dashboard et accès à la carte', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  const receipts: Receipt[] = []
  const failed: string[] = []
  const reads: Promise<void>[] = []
  page.on('response', (response) => {
    const host = new URL(response.url()).host
    if (host === WEATHER || host === LAND) reads.push(inspect(response).then((r) => { receipts.push(r) }))
  })
  page.on('requestfailed', (request) => {
    const host = new URL(request.url()).host
    if (host === WEATHER || host === LAND) failed.push(`${host}: ${request.failure()?.errorText ?? 'échec réseau'}`)
  })
  await page.goto('hunt?lat=46.8&lng=-71.2')
  const recommendation = page.getByTestId('hunt-recommendation')
  await expect(recommendation).toBeVisible({ timeout: 120_000 })
  await Promise.all(reads)
  const weatherOk = receipts.some((r) => r.host === WEATHER && r.valid)
  const landOk = receipts.some((r) => r.host === LAND && r.valid)
  await testInfo.attach('services-reels', {
    body: JSON.stringify({ weatherOk, landOk, receipts, failed, recommendation: await recommendation.innerText() }, null, 2),
    contentType: 'application/json',
  })
  await testInfo.attach('dashboard-reel', { body: await page.screenshot(), contentType: 'image/png' })
  await expect(recommendation).toContainText(/Pour ce lieu et cette période|Sans météo/)
  test.skip(!weatherOk || !landOk, 'Validation réseau incomplète : consulter services-reels ; ce résultat ne valide pas les données des fournisseurs.')
  await expect(page.getByRole('img', { name: /Indice horaire/ })).toBeVisible()
  await expect(page.getByRole('progressbar', { name: 'Couverture des données cartographiques' })).toBeVisible()
  const map = page.getByRole('button', { name: 'Voir sur la carte', exact: true })
  await expect(map).toBeEnabled()
  await map.click()
  await expect(page).toHaveURL(/\/map/)
  await expect(page.locator('canvas.maplibregl-canvas').first()).toBeVisible({ timeout: 30_000 })
  await testInfo.attach('carte-reelle', { body: await page.screenshot(), contentType: 'image/png' })
})
