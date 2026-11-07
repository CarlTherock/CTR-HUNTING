import type { Page } from '@playwright/test'
import { expect, test } from './support/test'

/**
 * « Où et quand chasser » — SIMULÉ : les réponses Open-Meteo et Overpass sont des gabarits
 * de test (forme réelle, valeurs inventées pour le test). Cela prouve la logique et la mise en
 * page de l'application dans Chromium, PAS l'exactitude des services ni un essai sur iPhone.
 */
const TZ = 'America/Toronto'

function localDate(offsetDays = 0): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(
    new Date(Date.now() + offsetDays * 24 * 3600_000),
  )
}

async function installProviders(page: Page) {
  const cors = { 'access-control-allow-origin': '*' }
  await page.route('https://api.open-meteo.com/**', async (route) => {
    const days = Number(
      new URL(route.request().url()).searchParams.get('forecast_days') ?? '2',
    )
    const times: string[] = []
    for (let d = 0; d < days; d++)
      for (let h = 0; h < 24; h++)
        times.push(`${localDate(d)}T${String(h).padStart(2, '0')}:00`)
    const fill = (v: number) => times.map(() => v)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: cors,
      body: JSON.stringify({
        timezone: TZ,
        hourly: {
          time: times,
          temperature_2m: fill(4),
          surface_pressure: fill(1012),
          precipitation: fill(0),
          cloud_cover: fill(40),
          wind_speed_10m: fill(12),
          wind_gusts_10m: fill(20),
          wind_direction_10m: fill(270),
        },
        daily: { time: Array.from({ length: days }, (_, d) => localDate(d)) },
      }),
    })
  })
  await page.route('https://overpass-api.de/**', async (route) => {
    // Gabarit dépendant de l'étendue demandée : forêt à l'ouest et à l'est, champ au centre.
    const data = decodeURIComponent(route.request().postData() ?? '')
    const m = /\((-?\d+\.\d+),(-?\d+\.\d+),(-?\d+\.\d+),(-?\d+\.\d+)\)/.exec(data)
    const [south, west, north, east] = m
      ? m.slice(1, 5).map(Number)
      : [46.8, -71.2, 46.81, -71.19]
    const w = east - west
    const box = (x0: number, x1: number) => [
      { lat: south, lon: west + w * x0 },
      { lat: south, lon: west + w * x1 },
      { lat: north, lon: west + w * x1 },
      { lat: north, lon: west + w * x0 },
      { lat: south, lon: west + w * x0 },
    ]
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: cors,
      body: JSON.stringify({
        elements: [
          { type: 'way', id: 1, tags: { landuse: 'forest' }, geometry: box(0, 0.38) },
          {
            type: 'way',
            id: 2,
            tags: { landuse: 'farmland' },
            geometry: box(0.38, 0.62),
          },
          { type: 'way', id: 3, tags: { landuse: 'forest' }, geometry: box(0.62, 1) },
        ],
      }),
    })
  })
}

const SHOTS = process.env.HUNT_SHOTS

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

test.describe('Où et quand chasser (simulé)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('parcours réel : carte → bouton → point touché → dashboard, puis carte avec points et fiche', async ({
    page,
    backend,
  }) => {
    void backend
    await installProviders(page)
    await page.goto('map')
    // Entrée : « Outils » → « Où et quand chasser » (premier élément de la liste).
    await page.getByRole('button', { name: 'Outils' }).click()
    const entry = page.getByRole('button', { name: 'Où et quand chasser' })
    await expect(entry).toBeVisible()
    await shot(page, '1-entree-carte')

    await entry.click()
    await expect(
      page.getByText('Touchez la carte pour choisir le point à analyser'),
    ).toBeVisible()
    await shot(page, '1b-choix-du-point')
    const box = await page.locator('canvas.maplibregl-canvas').first().boundingBox()
    if (!box) throw new Error('carte introuvable')
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

    // Fiche « Évaluer ce lieu » : date préremplie et modifiable, puis un seul bouton.
    const sheet = page.getByTestId('hunt-evaluate-sheet')
    await expect(sheet).toBeVisible()
    await expect(sheet.getByLabel('Date de début')).not.toHaveValue('')
    await shot(page, '1c-evaluer-ce-lieu')
    await sheet.getByRole('button', { name: 'Évaluer ce lieu' }).click()

    // Dashboard : la recommandation d'abord : pas d'ancien panneau, pas de formulaire.
    await expect(page.getByTestId('hunt-recommendation')).toBeVisible()
    await expect(page.getByTestId('hunt-recommendation')).toContainText(
      /Pour ce lieu et cette période/,
    )
    await expect(page.getByText('Meilleur créneau estimé')).toBeVisible()
    await expect(page.getByText(/Détails avancés — analyse générale/)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Analyser', exact: true })).toHaveCount(
      0,
    )
    await expect(page).toHaveURL(/hunt\?lat=46\.\d+&lng=-71\.\d+/)
    await expect(page.getByRole('img', { name: /Indice horaire/ })).toBeVisible()
    await shot(page, '2-synthese')
    await page.getByRole('img', { name: /Indice horaire/ }).scrollIntoViewIfNeeded()
    await shot(page, '3-graphique')

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)

    // Les explications existent mais restent repliées.
    await page.getByText('Formule, méthodologie et limites').click()
    await expect(page.getByText(/non évaluée/).first()).toBeVisible()

    await page.getByRole('button', { name: 'Voir sur la carte' }).click()
    await expect(page).toHaveURL(/\/map/)
    await page.getByRole('button', { name: /Où chasser · légende/ }).click()
    await expect(page.getByText(/pas une piste observée/)).toBeVisible()
    await page.waitForTimeout(2500)
    await shot(page, '4-carte-points-corridors')
    if (SHOTS) {
      // Capture seulement : toucher le premier point candidat (position propre à ce gabarit).
      await page.getByRole('button', { name: /Où chasser · légende/ }).click()
      await page.mouse.click(130, 184)
      await expect(page.getByTestId('hunt-point-sheet')).toBeVisible()
      await shot(page, '5-fiche-point')
    }
  })

  test('sans météo : la recommandation reste, dit ce qui manque et ne valorise pas l’absence', async ({
    page,
    backend,
  }) => {
    void backend
    await page.route('https://api.open-meteo.com/**', (r) => r.abort())
    await page.route('https://overpass-api.de/**', (r) => r.abort())
    await page.goto('hunt?lat=45.6&lng=-72.0')
    const reco = page.getByTestId('hunt-recommendation')
    await expect(reco).toBeVisible()
    await expect(reco).toContainText(/Sans météo/)
    await reco.getByText(/Contexte saisonnier, informations manquantes/).click()
    await expect(reco).toContainText(/Météo indisponible/)
    await expect(reco).not.toContainText(/favorable au poste/)
    await shot(page, '6-sans-meteo')
  })

  test('hors territoire documenté : aucun repère québécois appliqué, horaires conservés', async ({
    page,
    backend,
  }) => {
    void backend
    await installProviders(page)
    await page.goto('hunt?lat=44.0&lng=-80.5')
    const reco = page.getByTestId('hunt-recommendation')
    await expect(reco).toBeVisible()
    await expect(reco).toContainText(/Aucun repère saisonnier documenté/)
    await expect(reco).not.toContainText(/fin octobre à mi-novembre/)
    await shot(page, '7-hors-territoire')
  })

  test('hors ligne : la dernière analyse du même endroit est relue', async ({
    page,
    context,
    backend,
  }) => {
    void backend
    await installProviders(page)
    await page.goto('hunt?lat=46.8&lng=-71.2')
    await expect(page.getByText('Meilleur créneau estimé')).toBeVisible()
    await expect(page.getByText(/Prévision reçue à/)).toBeVisible()

    await page.unroute('https://api.open-meteo.com/**')
    await page.unroute('https://overpass-api.de/**')
    await page.route('https://api.open-meteo.com/**', (r) => r.abort())
    await page.route('https://overpass-api.de/**', (r) => r.abort())
    await context.setOffline(true)
    await page.getByRole('button', { name: /Paramètres/ }).click()
    await page.getByRole('button', { name: 'Analyser', exact: true }).click()
    await expect(page.getByText(/Analyse enregistrée le/).first()).toBeVisible()
    await expect(page.getByText(/Réseau indisponible/)).toBeVisible()
    await context.setOffline(false)
  })

  test('le créneau de rut ne donne aucune date locale inventée et la page reste utilisable sans réseau', async ({
    page,
    backend,
  }) => {
    void backend
    await page.route('https://api.open-meteo.com/**', (r) => r.abort())
    await page.route('https://overpass-api.de/**', (r) => r.abort())
    await page.goto('hunt?lat=46.8&lng=-71.2')
    await expect(page.getByText(/Réseau indisponible/)).toBeVisible()
    await expect(page.getByText(/Occupation du sol indisponible/)).toBeVisible()
    await page.getByText('Pourquoi ce créneau ? Détails et calendrier').click()
    await expect(page.getByText(/Contexte saisonnier \(rut\)/)).toBeVisible()
  })

  test('occupation du sol en échec (504) : la cause réelle et le contrôle des services sont visibles', async ({
    page,
    backend,
  }) => {
    void backend
    await installProviders(page)
    await page.unroute('https://overpass-api.de/**')
    await page.route('https://overpass-api.de/**', (r) =>
      r.fulfill({
        status: 504,
        headers: { 'access-control-allow-origin': '*' },
        body: '',
      }),
    )
    await page.goto('hunt?lat=46.8&lng=-71.2')
    await expect(page.getByText(/overpass-api.de a répondu HTTP 504/)).toBeVisible()
    await page.getByRole('button', { name: 'Vérifier les services' }).click()
    const check = page.getByTestId('service-check').first()
    await expect(check).toContainText(/Non joignable — Overpass.*HTTP 504/)
    await expect(check).toContainText(/Joignable — Open-Meteo/)
    await shot(page, '8-echec-occupation-du-sol')
  })

  test('forêt OSM dont le contour est coupé en plusieurs chemins : secteurs et points affichés', async ({
    page,
    backend,
  }) => {
    void backend
    await installProviders(page)
    await page.unroute('https://overpass-api.de/**')
    await page.route('https://overpass-api.de/**', async (route) => {
      const data = decodeURIComponent(route.request().postData() ?? '')
      const m = /\((-?\d+\.\d+),(-?\d+\.\d+),(-?\d+\.\d+),(-?\d+\.\d+)\)/.exec(data)
      const [south, west, north, east] = m ? m.slice(1, 5).map(Number) : [0, 0, 1, 1]
      const w = east - west
      const p = (x: number, y: number) => ({
        lat: south + (north - south) * y,
        lon: west + w * x,
      })
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          elements: [
            {
              type: 'relation',
              id: 7,
              tags: { landuse: 'forest' },
              members: [
                { type: 'way', role: 'outer', geometry: [p(0, 0), p(0.4, 0), p(0.4, 1)] },
                { type: 'way', role: 'outer', geometry: [p(0, 1), p(0.4, 1)] },
                { type: 'way', role: 'outer', geometry: [p(0, 1), p(0, 0)] },
              ],
            },
            {
              type: 'way',
              id: 8,
              tags: { landuse: 'farmland' },
              geometry: [p(0.4, 0), p(1, 0), p(1, 1), p(0.4, 1), p(0.4, 0)],
            },
          ],
        }),
      })
    })
    await page.goto('hunt?lat=46.8&lng=-71.2')
    await expect(page.getByText(/Point P\d/).first()).toBeVisible()
    await expect(page.getByText(/[12] secteur\(s\)/).first()).toBeVisible()
    await expect(page.getByText(/Occupation du sol indisponible/)).toHaveCount(0)
    await shot(page, '9-dashboard-contour-coupe')
    await page.getByRole('button', { name: 'Voir sur la carte' }).click()
    await expect(page).toHaveURL(/\/map/)
    await page.waitForTimeout(2500)
    await shot(page, '10-carte-contour-coupe')
  })
})
