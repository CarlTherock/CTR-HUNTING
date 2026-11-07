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
    const ring = (lat: number, lon: number) => [
      { lat, lon },
      { lat, lon: lon + 0.006 },
      { lat: lat + 0.005, lon: lon + 0.006 },
      { lat: lat + 0.005, lon },
      { lat, lon },
    ]
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: cors,
      body: JSON.stringify({
        elements: [
          {
            type: 'way',
            id: 1,
            tags: { landuse: 'forest' },
            geometry: ring(46.795, -71.206),
          },
          {
            type: 'way',
            id: 2,
            tags: { landuse: 'farmland' },
            geometry: ring(46.795, -71.2),
          },
        ],
      }),
    })
  })
}

test.describe('Où et quand chasser (simulé)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('analyse un point GPS sans observation, montre les 4 sections et relit hors ligne', async ({
    page,
    context,
    backend,
  }) => {
    void backend
    await installProviders(page)
    await page.goto('hunt?lat=46.8&lng=-71.2')

    const run = page.getByRole('button', { name: 'Analyser', exact: true })
    await expect(run).toBeEnabled()
    await run.click()

    await expect(page.getByText('Calculée maintenant')).toBeVisible()
    await expect(page.getByText(/Pourquoi ce créneau/)).toBeVisible()
    await expect(page.getByRole('img', { name: /Indice horaire/ })).toBeVisible()

    // Mobile : aucun défilement horizontal de la page.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)

    await page.getByRole('tab', { name: 'OÙ' }).click()
    await expect(page.getByText(/Secteurs d’habitat/)).toBeVisible()
    await expect(page.getByText(/Corridors non calculés/)).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Créer un repère' }).first(),
    ).toBeVisible()

    await page.getByRole('tab', { name: 'COMMENT' }).click()
    await expect(page.getByText(/non évaluée/)).toBeVisible()

    await page.getByRole('tab', { name: 'Sources' }).click()
    await expect(
      page.getByText(/Aucune référence n’est présentée comme lue intégralement/),
    ).toBeVisible()

    // Hors ligne : la dernière analyse du même endroit est relue.
    // Les gabarits interceptent avant le réseau : on les remplace par un échec réseau.
    await page.unroute('https://api.open-meteo.com/**')
    await page.unroute('https://overpass-api.de/**')
    await page.route('https://api.open-meteo.com/**', (r) => r.abort())
    await page.route('https://overpass-api.de/**', (r) => r.abort())
    await context.setOffline(true)
    await page.getByRole('button', { name: /Paramètres/ }).click()
    await page.getByRole('button', { name: 'Analyser', exact: true }).click()
    await expect(page.getByText('Enregistrée sur l’appareil')).toBeVisible()
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
    await page.getByRole('button', { name: 'Analyser', exact: true }).click()
    await expect(page.getByText(/Réseau indisponible/)).toBeVisible()
    await expect(page.getByText(/Contexte saisonnier \(rut\)/)).toBeVisible()
    await page.getByRole('tab', { name: 'OÙ' }).click()
    await expect(page.getByText(/Aucune donnée d’occupation du sol/)).toBeVisible()
  })
})
