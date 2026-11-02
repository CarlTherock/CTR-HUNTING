import { Navigation } from 'lucide-react'
import type { PointDaily, PointHourly } from '@/types'
import { conditionOf } from '../forecast/weatherCodes'
import { longDate, num, windFrom } from '../forecast/format'
import { WeatherIcon } from './WeatherIcon'

/** Main card of the selected day and hour: date, temperature, min/max,
 * conditions, wind with direction, gusts. Every value is a FORECAST. */
export function MainWeatherCard({
  day,
  hour,
}: {
  day: PointDaily
  hour: PointHourly | null
}) {
  const cond = conditionOf(hour?.weatherCode ?? day.weatherCode)
  const temp = hour?.temperatureCelsius ?? null
  const from = hour?.windDirectionDegrees ?? null
  return (
    <section
      data-testid="main-weather"
      className="border-surface-700 from-brand-500/20 via-surface-900 to-surface-900 flex flex-col items-center gap-2 rounded-2xl border bg-gradient-to-b px-5 py-6 text-center shadow-lg shadow-black/30"
    >
      <p className="text-ink-300 text-sm capitalize">{longDate(day.date)}</p>
      <div className="flex items-center gap-3">
        <WeatherIcon kind={cond.icon} size={44} />
        <p className="text-ink-100 text-6xl leading-none font-bold">
          {temp === null ? '—' : `${Math.round(temp)}°`}
        </p>
      </div>
      <p className="text-ink-300 text-sm">
        <span aria-label="Maximum">↑ {num(day.temperatureMaxCelsius, '°')}</span>
        {'  '}
        <span aria-label="Minimum">↓ {num(day.temperatureMinCelsius, '°')}</span>
      </p>
      <p className="text-ink-100 text-xl font-medium">{cond.label}</p>
      <p className="text-ink-500 text-xs">
        {hour ? `Prévision de ${hour.time.slice(11, 16)}` : 'Heure indisponible'}
        {' · ressenti '}
        {num(hour?.apparentTemperatureCelsius, '°C')}
      </p>
      <div className="border-surface-700 mt-2 grid w-full grid-cols-2 gap-3 border-t pt-4 text-sm">
        <div>
          <p className="text-ink-500 text-xs">Vent</p>
          <p
            className="text-ink-100 flex items-center justify-center gap-1.5"
            data-testid="main-wind"
          >
            {from !== null && (
              <Navigation
                size={14}
                className="text-brand-400"
                style={{ transform: `rotate(${(from + 180) % 360}deg)` }}
                aria-hidden="true"
              />
            )}
            {num(hour?.windSpeedKmh, 'km/h')} {windFrom(from)}
          </p>
        </div>
        <div>
          <p className="text-ink-500 text-xs">Rafales</p>
          <p className="text-ink-100">{num(hour?.windGustsKmh, 'km/h')}</p>
        </div>
        <div className="col-span-2">
          <p className="text-ink-500 text-xs">Précipitations du jour</p>
          <p className="text-ink-100">{num(day.precipitationSumMm, 'mm', 1)}</p>
        </div>
      </div>
    </section>
  )
}
