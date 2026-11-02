import { Card } from '@/components/ui'
import type { PointDaily, PointHourly } from '@/types'
import { conditionOf } from '../forecast/weatherCodes'
import { num, windFrom } from '../forecast/format'
import { WeatherIcon } from './WeatherIcon'

/** Main card of the selected day and hour: conditions, temperature, feels-like,
 * min/max, wind, gusts and direction. Every value is a FORECAST. */
export function MainWeatherCard({
  day,
  hour,
}: {
  day: PointDaily
  hour: PointHourly | null
}) {
  const cond = conditionOf(hour?.weatherCode ?? day.weatherCode)
  const temp = hour?.temperatureCelsius ?? null
  return (
    <Card className="flex flex-col gap-3 p-5" data-testid="main-weather">
      <div className="flex items-center gap-4">
        <WeatherIcon kind={cond.icon} size={48} />
        <div className="min-w-0 flex-1">
          <p className="text-ink-100 text-4xl leading-none font-bold">
            {temp === null ? '—' : `${Math.round(temp)}°`}
          </p>
          <p className="text-ink-300 mt-1.5 text-sm">{cond.label}</p>
          <p className="text-ink-500 text-xs">
            {hour ? `Prévision de ${hour.time.slice(11, 16)}` : 'Heure indisponible'}
            {' · ressenti '}
            {num(hour?.apparentTemperatureCelsius, '°C')}
          </p>
        </div>
      </div>
      <dl className="border-surface-700 grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-3 text-sm">
        <div>
          <dt className="text-ink-500 text-xs">Minimum / maximum du jour</dt>
          <dd className="text-ink-100">
            {num(day.temperatureMinCelsius, '°C')} /{' '}
            {num(day.temperatureMaxCelsius, '°C')}
          </dd>
        </div>
        <div>
          <dt className="text-ink-500 text-xs">Précipitations du jour</dt>
          <dd className="text-ink-100">{num(day.precipitationSumMm, 'mm', 1)}</dd>
        </div>
        <div>
          <dt className="text-ink-500 text-xs">Vent</dt>
          <dd className="text-ink-100" data-testid="main-wind">
            {num(hour?.windSpeedKmh, 'km/h')} {windFrom(hour?.windDirectionDegrees)}
          </dd>
        </div>
        <div>
          <dt className="text-ink-500 text-xs">Rafales</dt>
          <dd className="text-ink-100">{num(hour?.windGustsKmh, 'km/h')}</dd>
        </div>
      </dl>
    </Card>
  )
}
