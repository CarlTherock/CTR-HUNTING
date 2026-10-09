import type { Page } from '@playwright/test'

/**
 * SIMULATED Open-Meteo and Overpass answers for the potential-map E2E test.
 * They are fixtures with the real response SHAPE (so the real providers,
 * stores and UI run unchanged); they prove the app's logic, never the
 * accuracy of the real services. Times are generated for "today" in
 * America/Toronto so the app's "actuel / prévision" logic sees a window that
 * contains the current hour, exactly like the real forecast_days=2 answer.
 */
const TZ = 'America/Toronto'

function localParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: get('hour'),
    minute: get('minute'),
  }
}

/** Heure d'aujourd'hui où le fournisseur simulé met pluie et vent fort : 18 h,
 * sauf s'il est justement 18 h (l'heure serait alors « actuelle », et la
 * comparaison « maintenant / autre créneau » n'aurait plus de sens). */
export function specialHour(): number {
  return Number(localParts(new Date()).hour) === 18 ? 9 : 18
}

export function hourlyTimes(): string[] {
  const today = localParts(new Date()).date
  const tomorrow = localParts(new Date(Date.now() + 24 * 3600_000)).date
  const times: string[] = []
  for (const day of [today, tomorrow]) {
    for (let h = 0; h < 24; h++) times.push(`${day}T${String(h).padStart(2, '0')}:00`)
  }
  return times
}

export interface ProviderCounts {
  weather: number
  wind: number
  overpass: number
}

export async function installAnalysisProviders(page: Page): Promise<ProviderCounts> {
  const counts: ProviderCounts = { weather: 0, wind: 0, overpass: 0 }
  const cors = { 'access-control-allow-origin': '*' }

  await page.route('https://api.open-meteo.com/**', async (route) => {
    const url = new URL(route.request().url())
    const latitudes = (url.searchParams.get('latitude') ?? '').split(',')
    const times = hourlyTimes()
    if (latitudes.length > 1) {
      counts.wind++
      const body = latitudes.map((_, i) => ({
        timezone: TZ,
        hourly: {
          time: times,
          // Varie par point de grille, et plus fort à l'heure spéciale.
          wind_speed_10m: times.map(
            (_, h) => 8 + (i % 6) + (h === specialHour() ? 22 : 0),
          ),
          wind_direction_10m: times.map(() => 270),
          wind_gusts_10m: times.map(() => 20),
          temperature_2m: times.map(() => 17),
          precipitation: times.map(() => 0),
          cloud_cover: times.map(() => 30),
        },
      }))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: cors,
        body: JSON.stringify(body),
      })
      return
    }
    counts.weather++
    const now = localParts(new Date())
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: cors,
      body: JSON.stringify({
        timezone: TZ,
        current: {
          time: `${now.date}T${now.hour}:${now.minute}`,
          temperature_2m: 19,
          relative_humidity_2m: 50,
          surface_pressure: 1013,
          precipitation: 0,
          cloud_cover: 20,
          wind_speed_10m: 9,
          wind_gusts_10m: 14,
        },
        hourly: {
          time: times,
          temperature_2m: times.map(() => 18),
          relative_humidity_2m: times.map(() => 55),
          surface_pressure: times.map(() => 1013),
          // Forte pluie à l'heure spéciale : une différence nette « maintenant / ce soir ».
          precipitation: times.map((_, h) => (h === specialHour() ? 7 : 0)),
          cloud_cover: times.map(() => 30),
          visibility: times.map(() => 20000),
          wind_speed_10m: times.map(() => 10),
          wind_gusts_10m: times.map(() => 15),
        },
      }),
    })
  })

  await page.route('https://overpass-api.de/**', async (route) => {
    counts.overpass++
    const body = route.request().postData() ?? ''
    const query = decodeURIComponent(body.replace(/\+/g, ' '))
    const m = /nwr\((-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)\)/.exec(query)
    const [south, west, north, east] = m
      ? [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]
      : [0, 0, 0, 0]
    const at = (fy: number, fx: number) => ({
      lat: south + (north - south) * fy,
      lon: west + (east - west) * fx,
    })
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: cors,
      body: JSON.stringify({
        elements: [
          { type: 'way', id: 1, center: at(0.3, 0.3), tags: { landuse: 'forest' } },
          { type: 'way', id: 2, center: at(0.3, 0.32), tags: { natural: 'water' } },
          { type: 'way', id: 3, center: at(0.7, 0.7), tags: { landuse: 'residential' } },
        ],
      }),
    })
  })

  return counts
}
