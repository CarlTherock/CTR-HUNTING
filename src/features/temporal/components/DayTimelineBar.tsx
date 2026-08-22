import { timeToPercent } from '@/utils/temporal'
import type { SolunarPeriod, SunTimes } from '@/types'

export interface DayTimelineBarProps {
  dayStart: Date
  sun: SunTimes
  solunarPeriods: SolunarPeriod[]
  /** Only drawn when the bar is showing today. */
  now?: Date | null
  /** Real hour-of-day (0-23), when provided — the Phase 10 shared
   * timeline cursor (`windStore.selectedHourOffset`), so dragging the
   * Advanced Chart's cursor or the wind timeline also moves a marker
   * here, satisfying "the time cursor synchronizes … temporal data." */
  selectedHour?: number | null
}

/** The roadmap's "global 24h timeline" (Phase 7) — a single horizontal
 * bar spanning local midnight to midnight: night/dawn/day/dusk shading
 * from real sun times, major/minor solunar period bands, and a "now"
 * marker. All positions come from `timeToPercent`, never hand-tuned. */
export function DayTimelineBar({ dayStart, sun, solunarPeriods, now, selectedHour }: DayTimelineBarProps) {
  const dawn = sun.dawn ? timeToPercent(sun.dawn, dayStart) : null
  const sunrise = sun.sunrise ? timeToPercent(sun.sunrise, dayStart) : null
  const sunset = sun.sunset ? timeToPercent(sun.sunset, dayStart) : null
  const dusk = sun.dusk ? timeToPercent(sun.dusk, dayStart) : null
  const nowPercent = now ? timeToPercent(now.toISOString(), dayStart) : null
  const selectedHourPercent = selectedHour != null ? (selectedHour / 24) * 100 : null

  // Night (dark) as the base, with a lighter band from dawn to dusk (or
  // sunrise/sunset if dawn/dusk aren't available) layered on top — never
  // fabricated when the sun genuinely doesn't rise/set that day (polar
  // regions): the light band is simply omitted.
  const dayBandStart = dawn ?? sunrise
  const dayBandEnd = dusk ?? sunset

  return (
    <div className="w-full">
      <div className="border-surface-600 relative h-14 w-full overflow-hidden rounded-md border">
        <div className="bg-surface-950 absolute inset-0" aria-hidden="true" />
        {dayBandStart !== null && dayBandEnd !== null && (
          <div
            className="bg-brand-500/25 absolute inset-y-0"
            style={{ left: `${dayBandStart}%`, width: `${Math.max(0, dayBandEnd - dayBandStart)}%` }}
            aria-hidden="true"
          />
        )}
        {sunrise !== null && sunset !== null && (
          <div
            className="bg-brand-400/40 absolute inset-y-0"
            style={{ left: `${sunrise}%`, width: `${Math.max(0, sunset - sunrise)}%` }}
            aria-hidden="true"
          />
        )}
        {solunarPeriods.map((period, i) => {
          const start = timeToPercent(period.start, dayStart)
          const end = timeToPercent(period.end, dayStart)
          return (
            <div
              key={i}
              title={`${period.type === 'major' ? 'Major' : 'Minor'} solunar period`}
              className={
                period.type === 'major'
                  ? 'absolute inset-y-0 bg-amber-500/80'
                  : 'absolute inset-y-0 bg-amber-500/40'
              }
              // A real period can be a fraction of a percent of the full
              // 24h bar (a ±30min minor window is ~2%) — floored to a
              // real minimum so it's still visible/tappable on a phone
              // screen, never so wide it misrepresents the actual window.
              style={{ left: `${start}%`, width: `${Math.max(2.5, end - start)}%` }}
            />
          )
        })}
        {selectedHourPercent !== null && (
          <div
            className="bg-ink-100 absolute inset-y-0 w-1 shadow-[0_0_4px_rgba(0,0,0,0.8)]"
            style={{ left: `${selectedHourPercent}%` }}
            aria-label="Selected hour (shared timeline cursor)"
            title="Selected hour"
          />
        )}
        {nowPercent !== null && (
          <div
            className="bg-status-danger absolute inset-y-0 w-1 shadow-[0_0_4px_rgba(0,0,0,0.8)]"
            style={{ left: `${nowPercent}%` }}
            aria-label="Now"
            title="Now"
          />
        )}
      </div>
      <div className="text-ink-500 mt-1 flex justify-between text-[10px]">
        <span>12 AM</span>
        <span>6 AM</span>
        <span>12 PM</span>
        <span>6 PM</span>
        <span>12 AM</span>
      </div>
      <div className="text-ink-500 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
        <span className="flex items-center gap-1">
          <span className="bg-brand-400/60 h-2.5 w-2.5 rounded-sm" aria-hidden="true" />
          Daylight
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-amber-500/80 h-2.5 w-2.5 rounded-sm" aria-hidden="true" />
          Major solunar
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-amber-500/40 h-2.5 w-2.5 rounded-sm" aria-hidden="true" />
          Minor solunar
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-status-danger h-2.5 w-1 rounded-sm" aria-hidden="true" />
          Now
        </span>
        {selectedHourPercent !== null && (
          <span className="flex items-center gap-1">
            <span className="bg-ink-100 h-2.5 w-1 rounded-sm" aria-hidden="true" />
            Selected hour
          </span>
        )}
      </div>
    </div>
  )
}
