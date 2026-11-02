import type { PointDaily } from '@/types'
import { conditionOf } from '../forecast/weatherCodes'
import { num, weekdayShort } from '../forecast/format'
import { WeatherIcon } from './WeatherIcon'

/** Days of the forecast: weekday, date, icon, min/max. The selection is
 * shown by colour AND by `aria-pressed`. */
export function DaySelector({
  days,
  selected,
  onSelect,
  today,
}: {
  days: PointDaily[]
  selected: string
  onSelect: (dateKey: string) => void
  today: string
}) {
  return (
    <div
      role="group"
      aria-label="Jour de la prévision météo"
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2"
    >
      {days.map((day) => {
        const active = day.date === selected
        const cond = conditionOf(day.weatherCode)
        return (
          <button
            key={day.date}
            type="button"
            aria-pressed={active}
            aria-label={`${weekdayShort(day.date)}, ${cond.label}, minimum ${num(day.temperatureMinCelsius, '°C')}, maximum ${num(day.temperatureMaxCelsius, '°C')}`}
            onClick={() => onSelect(day.date)}
            className={
              'flex min-h-[88px] min-w-[76px] shrink-0 flex-col items-center gap-1 rounded-xl border px-2 py-2 text-center ' +
              (active
                ? 'border-brand-400 bg-brand-500/15 text-ink-100'
                : 'border-surface-700 bg-surface-900 text-ink-300')
            }
          >
            <span className="text-xs font-medium">
              {day.date === today ? 'Aujourd’hui' : weekdayShort(day.date)}
            </span>
            <WeatherIcon kind={cond.icon} size={22} />
            <span className="text-ink-100 text-xs">
              {day.temperatureMaxCelsius === null
                ? '—'
                : `${Math.round(day.temperatureMaxCelsius)}°`}
              <span className="text-ink-500">
                {' / '}
                {day.temperatureMinCelsius === null
                  ? '—'
                  : `${Math.round(day.temperatureMinCelsius)}°`}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
