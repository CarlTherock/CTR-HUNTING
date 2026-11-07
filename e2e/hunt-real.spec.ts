import { expect, test } from './support/test'

/**
 * Vérification avec les VRAIS services (Open-Meteo, Overpass). Aucune donnée simulée.
 * Désactivée par défaut : `HUNT_REAL=1 npx playwright test e2e/hunt-real.spec.ts`.
 * Le test décrit honnêtement ce qui a été reçu ou l'erreur réelle ; il n'invente rien.
 */
test.skip(!process.env.HUNT_REAL, 'HUNT_REAL=1 requis (accès réseau réel)')
test.use({ viewport: { width: 390, height: 844 } })

test('point réel (Québec) : météo réelle reçue ou erreur réelle, recommandation produite', async ({
  page,
  backend,
}) => {
  void backend
  test.setTimeout(120_000)
  const calls: string[] = []
  page.on('response', (r) => {
    const u = r.url()
    if (u.includes('open-meteo.com') || u.includes('overpass'))
      calls.push(`${r.status()} ${new URL(u).host}`)
  })
  page.on('requestfailed', (r) => {
    const u = r.url()
    if (u.includes('open-meteo.com') || u.includes('overpass'))
      calls.push(`ECHEC ${new URL(u).host} ${r.failure()?.errorText ?? ''}`)
  })
  await page.goto('hunt?lat=46.8&lng=-71.2')
  const reco = page.getByTestId('hunt-recommendation')
  await expect(reco).toBeVisible({ timeout: 90_000 })
  await page.waitForTimeout(8000)
  const text = (await reco.innerText()).replace(/\s+/g, ' ')
  const weatherOk = calls.some((c) => c.startsWith('200 api.open-meteo.com'))
  console.log(`REEL services: ${calls.join(' | ') || 'aucun appel'}`)
  console.log(`REEL météo réelle reçue: ${weatherOk}`)
  console.log(`REEL recommandation: ${text.slice(0, 400)}`)
  await expect(reco).toContainText(/Pour ce lieu et cette période|Sans météo/)
  if (!weatherOk) await expect(reco).toContainText(/Sans météo|indisponible/)
})
