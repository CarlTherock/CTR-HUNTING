import type { Page } from '@playwright/test'

/**
 * SIMULATED Open-Meteo answers (real response SHAPE, test values): they prove
 * the app's logic, never the accuracy or availability of the real service.
 * Times are generated for « today » in America/Toronto.
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

export async function installOpenMeteo(page: Page) {
  await page.route('https://api.open-meteo.com/**', async (route) => {
    const url = new URL(route.request().url())
    const lat = (url.searchParams.get('latitude') ?? '').split(',')
    const days = Number(url.searchParams.get('forecast_days') ?? '2')
    const times = hourly(days)
    const fill = (value: number | null) => times.map(() => value)
    const dates = [...new Set(times.map((t) => t.slice(0, 10)))]
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
          time: dates,
          weather_code: dates.map(() => 3),
          temperature_2m_max: dates.map(() => 9),
          temperature_2m_min: dates.map(() => 2),
          apparent_temperature_max: dates.map(() => 6),
          apparent_temperature_min: dates.map(() => 0),
          sunrise: times
            .filter((_, i) => i % 24 === 0)
            .map((t) => `${t.slice(0, 10)}T07:00`),
          sunset: times
            .filter((_, i) => i % 24 === 0)
            .map((t) => `${t.slice(0, 10)}T17:00`),
          precipitation_sum: dates.map(() => 0),
          uv_index_max: dates.map(() => 1),
          wind_speed_10m_max: dates.map(() => 20),
          wind_gusts_10m_max: dates.map(() => 30),
          wind_direction_10m_dominant: dates.map(() => 315),
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
