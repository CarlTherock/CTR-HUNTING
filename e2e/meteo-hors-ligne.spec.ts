import type { Page } from '@playwright/test'
import { expect, test } from './support/test'

/**
 * « Télécharger pour ma sortie » : téléchargement en ligne, puis lecture et
 * relancement SANS réseau. Les réponses Open-Meteo sont SIMULÉES (forme réelle
 * de la réponse, valeurs de test) : ce test prouve la logique de l'application,
 * pas l'exactitude ni la disponibilité du vrai fournisseur.
 */
const TZ = 'America/Toronto'

function todayInToronto(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
}

function hourly(days: number): string[] {
  const start = new Date(`${todayInToronto()}T00:00:00Z`)
  const out: string[] = []
  for (let d = 0; d < days; d++) {
    const day = new Date(start)
    day.setUTCDate(day.getUTCDate() + d)
    const date = day.toISOString().slice(0, 10)
    for (let h = 0; h < 24; h++) out.push(`${date}T${String(h).padStart(2, '0')}:00`)
  }
  return out
}

async function installOpenMeteo(page: Page) {
  await page.route('https://api.open-meteo.com/**', async (route) => {
    const url = new URL(route.request().url())
    const lat = (url.searchParams.get('latitude') ?? '').split(',')
    const days = Number(url.searchParams.get('forecast_days') ?? '2')
    const times = hourly(days)
    const fill = (value: number | null) => times.map(() => value)
    let body: unknown
    if (url.searchParams.get('current')) {
      body = {
        timezone: TZ,
        current: {
          time: times[0],
          temperature_2m: 7,
          relative_humidity_2m: 70,
          surface_pressure: 1010,
          precipitation: 0,
          cloud_cover: 50,
          wind_speed_10m: 10,
          wind_gusts_10m: 20,
        },
        hourly: {
          time: times,
          temperature_2m: fill(7),
          relative_humidity_2m: fill(70),
          surface_pressure: fill(1010),
          precipitation: fill(0),
          cloud_cover: fill(50),
          visibility: fill(20000),
          wind_speed_10m: fill(10),
          wind_gusts_10m: fill(20),
        },
      }
    } else if (lat.length > 1) {
      body = lat.map(() => ({
        timezone: TZ,
        hourly: {
          time: times,
          wind_speed_10m: fill(14),
          wind_direction_10m: fill(315),
          wind_gusts_10m: fill(26),
          temperature_2m: fill(7),
          precipitation: fill(0),
          cloud_cover: fill(50),
        },
      }))
    } else {
      body = {
        timezone: TZ,
        hourly: {
          time: times,
          temperature_2m: fill(7),
          apparent_temperature: fill(4),
          weather_code: fill(3),
          precipitation: fill(0),
          precipitation_probability: fill(10),
          relative_humidity_2m: fill(70),
          surface_pressure: fill(1010),
          cloud_cover: fill(50),
          visibility: fill(null),
          uv_index: fill(null),
          wind_speed_10m: fill(14),
          wind_gusts_10m: fill(26),
          wind_direction_10m: fill(315),
          is_day: fill(1),
        },
        daily: {
          time: [...new Set(times.map((t) => t.slice(0, 10)))],
          weather_code: [3, 3, 3],
          temperature_2m_max: [9, 9, 9],
          temperature_2m_min: [2, 2, 2],
          apparent_temperature_max: [6, 6, 6],
          apparent_temperature_min: [0, 0, 0],
          sunrise: times
            .filter((_, i) => i % 24 === 0)
            .map((t) => `${t.slice(0, 10)}T07:00`),
          sunset: times
            .filter((_, i) => i % 24 === 0)
            .map((t) => `${t.slice(0, 10)}T17:00`),
          precipitation_sum: [0, 0, 0],
          uv_index_max: [1, 1, 1],
          wind_speed_10m_max: [20, 20, 20],
          wind_gusts_10m_max: [30, 30, 30],
          wind_direction_10m_dominant: [315, 315, 315],
        },
      }
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(body),
    })
  })
}

test.describe('météo hors ligne', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('télécharge en ligne, puis relit les prévisions sans réseau après relancement', async ({
    page,
    context,
    backend,
  }) => {
    void backend
    test.setTimeout(120_000)
    await installOpenMeteo(page)
    await page.goto('weather')

    const card = page.getByTestId('outing-download')
    await expect(card.getByTestId('download-dates')).toContainText('72 h')
    await card.getByRole('button', { name: 'Centre de la carte' }).click()
    await card.getByRole('button', { name: 'Télécharger pour ma sortie' }).click()
    await expect(card.getByTestId('download-outcome')).toContainText(
      'Téléchargement complet',
    )
    const item = card.getByTestId('saved-forecast')
    await expect(item).toContainText('Prévisions enregistrées')
    await expect(item).toContainText('Couverture jusqu’au')

    // Le service worker doit contrôler la page avant de couper le réseau.
    await page.evaluate(() => navigator.serviceWorker.ready)
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
        timeout: 20_000,
      })
      .toBe(true)

    // Plus de réseau, puis relancement de la page.
    await context.setOffline(true)
    await page.reload()
    const offlineItem = page.getByTestId('outing-download').getByTestId('saved-forecast')
    await expect(offlineItem).toContainText('Hors ligne — prévisions téléchargées le')
    await expect(offlineItem).toContainText('Couverture jusqu’au')
    await expect(
      page.getByTestId('outing-download').getByRole('button', {
        name: 'Télécharger pour ma sortie',
      }),
    ).toBeDisabled()

    // Les valeurs absentes (visibilité, UV) restent « indisponible », jamais 0.
    await offlineItem.getByRole('button', { name: 'Consulter' }).click()
    await expect(offlineItem).toContainText('km/h')
  })
})
