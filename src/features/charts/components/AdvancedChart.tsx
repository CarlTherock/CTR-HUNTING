import { useState } from 'react'
import { useWeatherStore } from '@/features/weather/state/weatherStore'
import { useWindStore } from '@/features/wind/state/windStore'
import { cn } from '@/utils/cn'
import { resampleHourly } from '@/utils/chartResampling'
import type { ChartGranularity } from '@/utils/chartResampling'
import { buildLinePath, scaleLinear } from '@/utils/chartScale'
import type { HourlyForecastEntry } from '@/types'

const GRANULARITIES: ChartGranularity[] = ['1h', '3h', '6h', '12h', '24h']
const WIDTH = 600
const HEIGHT = 260
const PADDING = { top: 10, right: 10, bottom: 20, left: 10 }
const PLOT_LEFT = PADDING.left
const PLOT_RIGHT = WIDTH - PADDING.right
const PLOT_TOP = PADDING.top
const PLOT_BOTTOM = HEIGHT - PADDING.bottom

function formatHour(iso: string): string {
  return iso.slice(11, 16)
}

/** One bucket, plus the real hour-index (into the full unresampled
 * `hourly` array) it starts at — the index `windStore.selectedHourOffset`
 * is compared against and set to, so the shared cursor always refers to
 * a genuine hour, never a synthetic bucket position. */
interface PlottedBucket {
  bucket: HourlyForecastEntry
  realIndex: number
  x: number
}

function plotSeries(
  buckets: HourlyForecastEntry[],
  hourly: HourlyForecastEntry[],
  indexOffset: number,
): PlottedBucket[] {
  const xScale = scaleLinear(0, Math.max(1, buckets.length - 1), PLOT_LEFT, PLOT_RIGHT)
  return buckets.map((bucket, i) => {
    const realIndex = hourly.findIndex((h) => h.time === bucket.time)
    return { bucket, realIndex: (realIndex === -1 ? 0 : realIndex) + indexOffset, x: xScale(i) }
  })
}

/**
 * Phase 10 — Advanced Charts. Real hourly temperature/wind/precipitation
 * from the already-fetched 48h forecast (`weatherStore`), with:
 * - **Granularity** ("24h/12h/6h/3h/1h charts"): `resampleHourly()`
 *   buckets real hours together (averaged, never fabricated).
 * - **Pan**: the chart scrolls horizontally in its container at fine
 *   granularities, the same established pattern this app already uses
 *   for its hourly forecast strip (`WeatherPage.tsx`), rather than a
 *   custom drag gesture.
 * - **Cursor / hour selection**: click anywhere on the chart to move the
 *   shared timeline cursor — reusing `windStore.selectedHourOffset`
 *   directly (see its own doc comment for why this store, not a new
 *   parallel one). Moving it here also moves the Map page's wind layer
 *   hour and (via `DayTimelineBar`) the temporal page's marker —
 *   "synchronizes map, wind, weather, temporal data."
 * - **Day comparison**: overlays day 1 (real hours 0-23) against day 2
 *   (real hours 24-47) of the same already-fetched forecast, aligned by
 *   hour-of-day — real data, not a fabricated historical comparison
 *   (Open-Meteo's forecast API doesn't provide past data at all).
 */
export function AdvancedChart() {
  const forecast = useWeatherStore((state) => state.forecast)
  const selectedHourOffset = useWindStore((state) => state.selectedHourOffset)
  const setSelectedHourOffset = useWindStore((state) => state.setSelectedHourOffset)
  const [granularity, setGranularity] = useState<ChartGranularity>('3h')
  const [dayComparison, setDayComparison] = useState(false)

  if (!forecast || forecast.hourly.length === 0) return null
  const { hourly } = forecast

  const day1Series = dayComparison
    ? plotSeries(resampleHourly(hourly.slice(0, 24), granularity), hourly, 0)
    : plotSeries(resampleHourly(hourly, granularity), hourly, 0)
  const day2Series = dayComparison ? plotSeries(resampleHourly(hourly.slice(24, 48), granularity), hourly, 0) : []

  const allPlotted = [...day1Series, ...day2Series]
  const temps = allPlotted.map((s) => s.bucket.temperatureCelsius)
  const tempScale = scaleLinear(Math.min(...temps) - 1, Math.max(...temps) + 1, PLOT_BOTTOM, PLOT_TOP)
  const winds = allPlotted.map((s) => s.bucket.windSpeedKmh)
  const windScale = scaleLinear(0, Math.max(...winds, 1) + 2, PLOT_BOTTOM, PLOT_TOP)
  const maxPrecip = Math.max(...allPlotted.map((s) => s.bucket.precipitationMm), 1)

  const tempPath = buildLinePath(day1Series.map((s) => ({ x: s.x, y: tempScale(s.bucket.temperatureCelsius) })))
  const tempPath2 = buildLinePath(day2Series.map((s) => ({ x: s.x, y: tempScale(s.bucket.temperatureCelsius) })))
  const windPath = buildLinePath(day1Series.map((s) => ({ x: s.x, y: windScale(s.bucket.windSpeedKmh) })))

  const cursorSeries = dayComparison
    ? [...day1Series, ...day2Series].find((s) => s.realIndex % 24 === selectedHourOffset % 24)
    : day1Series.find((s) => s.realIndex === selectedHourOffset)

  function handleChartClick(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const relativeX = ((e.clientX - rect.left) / rect.width) * WIDTH
    let nearest = allPlotted[0]
    let nearestDistance = Infinity
    for (const s of allPlotted) {
      const distance = Math.abs(s.x - relativeX)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearest = s
      }
    }
    if (nearest) setSelectedHourOffset(nearest.realIndex)
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Chart granularity" className="flex gap-1">
          {GRANULARITIES.map((g) => (
            <button
              key={g}
              type="button"
              role="tab"
              aria-selected={granularity === g}
              onClick={() => setGranularity(g)}
              className={cn(
                'rounded-md px-2 py-1 text-xs font-medium transition-colors',
                granularity === g ? 'bg-brand-500/15 text-brand-400' : 'text-ink-300 hover:bg-surface-800',
              )}
            >
              {g}
            </button>
          ))}
        </div>
        <label className="text-ink-300 flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={dayComparison}
            onChange={(e) => setDayComparison(e.target.checked)}
          />
          Compare day 1 vs day 2
        </label>
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          onClick={handleChartClick}
          role="img"
          aria-label="Hourly temperature and wind chart"
          className="min-w-[500px] cursor-pointer"
        >
          <line x1={PLOT_LEFT} y1={PLOT_BOTTOM} x2={PLOT_RIGHT} y2={PLOT_BOTTOM} className="stroke-surface-700" />
          {allPlotted.map((s, i) => (
            <rect
              key={i}
              x={s.x - 3}
              y={PLOT_BOTTOM - (s.bucket.precipitationMm / maxPrecip) * 32}
              width={6}
              height={(s.bucket.precipitationMm / maxPrecip) * 32}
              className="fill-brand-500/40"
            />
          ))}
          {tempPath && <path d={tempPath} fill="none" className="stroke-status-danger" strokeWidth={2} />}
          {tempPath2 && (
            <path d={tempPath2} fill="none" className="stroke-status-danger" strokeWidth={2} strokeDasharray="4 3" />
          )}
          {windPath && <path d={windPath} fill="none" className="stroke-brand-400" strokeWidth={2} />}
          {/* Real markers at every plotted hour — a line alone reads as
              a trend, but each individual real reading (especially wind,
              which the user most needs to spot at a glance) should be
              directly visible as its own point, not just implied by the
              connecting line. */}
          {day1Series.map((s, i) => (
            <circle key={`temp-${i}`} cx={s.x} cy={tempScale(s.bucket.temperatureCelsius)} r={3} className="fill-status-danger" />
          ))}
          {day1Series.map((s, i) => (
            <circle key={`wind-${i}`} cx={s.x} cy={windScale(s.bucket.windSpeedKmh)} r={3} className="fill-brand-400" />
          ))}
          {cursorSeries && (
            <line
              x1={cursorSeries.x}
              y1={PLOT_TOP}
              x2={cursorSeries.x}
              y2={PLOT_BOTTOM}
              className="stroke-ink-100"
              strokeWidth={1}
            />
          )}
        </svg>
      </div>

      <div className="text-ink-500 mt-1 flex justify-between text-[10px]">
        <span className="text-status-danger">— Temperature</span>
        <span className="text-brand-400">— Wind speed</span>
        <span>▮ Precipitation</span>
      </div>
      {cursorSeries && (
        <p className="text-ink-500 mt-1 text-xs">
          Cursor: {formatHour(cursorSeries.bucket.time)} —{' '}
          {Math.round(cursorSeries.bucket.temperatureCelsius)}°C,{' '}
          {Math.round(cursorSeries.bucket.windSpeedKmh)} km/h
        </p>
      )}
    </div>
  )
}
