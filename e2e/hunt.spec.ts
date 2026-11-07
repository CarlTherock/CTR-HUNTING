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

    // Dashboard directement : pas d'ancien panneau, pas de formulaire.
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
})
