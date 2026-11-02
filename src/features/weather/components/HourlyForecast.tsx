import { Wind } from 'lucide-react'
import type { PointHourly } from '@/types'
import { conditionOf } from '../forecast/weatherCodes'
import { num, windFrom } from '../forecast/format'
import { WeatherIcon } from './WeatherIcon'

/** Hourly rows of the selected day. Choosing an hour also points the wind
 * analysis (shared timeline cursor) at that hour. */
export function HourlyForecast({
  hours,
  selected,
  onSelect,
}: {
  hours: PointHourly[]
  selected: string | null
  onSelect: (hourKey: string) => void
}) {
  return (
    <ul className="flex flex-col gap-1" aria-label="Prévisions horaires">
      {hours.map((h) => {
        const active = h.time === selected
        return (
          <li key={h.time}>
            <button
              type="button"
              aria-pressed={active}
              aria-label={`${h.time.slice(11, 16)} : voir le vent de cette heure`}
              onClick={() => onSelect(h.time)}
              className={
                'grid min-h-11 w-full grid-cols-[3rem_1.5rem_3rem_1fr] items-center gap-x-2 rounded-lg border px-2 py-1.5 text-left text-xs ' +
                (active
                  ? 'border-brand-400 bg-brand-500/15'
                  : 'border-surface-700 bg-surface-900')
              }
            >
              <span className="text-ink-100 font-medium">{h.time.slice(11, 16)}</span>
              <WeatherIcon kind={conditionOf(h.weatherCode).icon} size={18} />
              <span className="text-ink-100">
                {h.temperatureCelsius === null
                  ? '—'
                  : `${Math.round(h.temperatureCelsius)}°`}
              </span>
              <span className="text-ink-300 min-w-0">
                <Wind size={12} className="mr-1 inline" aria-hidden="true" />
                {num(h.windSpeedKmh, 'km/h')} {windFrom(h.windDirectionDegrees)} · rafales{' '}
                {num(h.windGustsKmh, 'km/h')} · pluie {num(h.precipitationMm, 'mm', 1)}
                {h.precipitationProbabilityPercent === null
                  ? ''
                  : ` (${Math.round(h.precipitationProbabilityPercent)} %)`}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
