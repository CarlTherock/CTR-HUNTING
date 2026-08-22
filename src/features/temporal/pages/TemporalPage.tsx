import { useMemo, useState } from 'react'
import { ArrowDownToLine, ArrowUpToLine, ChevronLeft, ChevronRight, Moon, Sunrise, Sunset } from 'lucide-react'
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader } from '@/components/ui'
import { useGeolocation } from '@/features/gps/useGeolocation'
import { useMapStore } from '@/features/map/state/mapStore'
import { useWindStore } from '@/features/wind/state/windStore'
import { computeTemporalData } from '@/utils/temporal'
import { DayTimelineBar } from '../components/DayTimelineBar'
import { MoonPhaseIcon } from '../components/MoonPhaseIcon'
import type { TemporalData } from '@/types'

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—'
  const totalMinutes = Math.round(ms / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`
}

function localMidnight(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString()
}

/** The soonest still-upcoming real sun/moon event today, for a weather-
 * app-style "Sunset in 3h42" banner — only ever built from real
 * computed times, and only when the event genuinely hasn't passed yet
 * (never shows a negative/elapsed duration). `null` when nothing is
 * left today (e.g. every event already passed). */
function nextEvent(data: TemporalData, now: Date): { label: string; iso: string; msUntil: number } | null {
  const candidates: { label: string; iso: string | null }[] = [
    { label: 'Sunrise', iso: data.sun.sunrise },
    { label: 'Sunset', iso: data.sun.sunset },
    { label: 'Moonrise', iso: data.moon.rise },
    { label: 'Moonset', iso: data.moon.set },
  ]
  let best: { label: string; iso: string; msUntil: number } | null = null
  for (const candidate of candidates) {
    if (!candidate.iso) continue
    const msUntil = new Date(candidate.iso).getTime() - now.getTime()
    if (msUntil <= 0) continue
    if (!best || msUntil < best.msUntil) best = { label: candidate.label, iso: candidate.iso, msUntil }
  }
  return best
}

/**
 * Phase 7 — sunrise/sunset, moonrise/moonset, moon phase, day length, and
 * a 24h timeline, all computed fully offline via SunCalc (see
 * `utils/temporal.ts` for why: sun/moon geometry doesn't need live data,
 * unlike Phases 5/6's weather/wind, so doing this without any network
 * call is strictly better for an offline-first app). Solunar major/minor
 * periods are real moon-transit/moonrise-moonset geometry per the
 * public-domain Solunar Theory — explicitly not a commercial "activity
 * score" (onX Hunt/HuntStand gate that kind of scoring behind proprietary
 * tuning this app has no way to verify or reproduce).
 */
export function TemporalPage() {
  const gpsReading = useGeolocation()
  const mapCenter = useMapStore((state) => state.view.center)
  const selectedHourOffset = useWindStore((state) => state.selectedHourOffset)
  const usingGps = gpsReading.status === 'available'
  const coordinate = usingGps ? gpsReading.value : mapCenter

  const [selectedDay, setSelectedDay] = useState(() => localMidnight(new Date()))
  const today = useMemo(() => localMidnight(new Date()), [])
  const isToday = isSameDay(selectedDay, today)

  const data = useMemo(
    () => computeTemporalData(selectedDay, coordinate),
    [selectedDay, coordinate],
  )
  const upcoming = isToday ? nextEvent(data, new Date()) : null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Sun & Moon"
        description="Sunrise/sunset, moon phase, and solunar periods for today and nearby days."
        actions={
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSelectedDay((d) => addDays(d, -1))}
              aria-label="Previous day"
              className="border-surface-600 text-ink-300 hover:bg-surface-800 rounded-lg border p-2"
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <span className="text-ink-100 min-w-[6.5rem] text-center text-sm font-medium">
              {isToday ? 'Today' : selectedDay.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
            <button
              type="button"
              onClick={() => setSelectedDay((d) => addDays(d, 1))}
              aria-label="Next day"
              className="border-surface-600 text-ink-300 hover:bg-surface-800 rounded-lg border p-2"
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        }
      />

      {!usingGps && <Badge variant="warning">Using map location — GPS unavailable</Badge>}

      {upcoming && (
        <Card className="flex items-center gap-3 p-4">
          {upcoming.label.startsWith('Sun') ? (
            upcoming.label === 'Sunrise' ? (
              <Sunrise size={28} className="text-brand-400 shrink-0" aria-hidden="true" />
            ) : (
              <Sunset size={28} className="text-brand-400 shrink-0" aria-hidden="true" />
            )
          ) : (
            <Moon size={28} className="text-brand-400 shrink-0" aria-hidden="true" />
          )}
          <div>
            <p className="text-ink-100 text-lg font-semibold">
              {upcoming.label} in {formatDuration(upcoming.msUntil)}
            </p>
            <p className="text-ink-500 text-xs">at {formatTime(upcoming.iso)}</p>
          </div>
        </Card>
      )}

      <DayTimelineBar
        dayStart={selectedDay}
        sun={data.sun}
        solunarPeriods={data.solunarPeriods}
        now={isToday ? new Date() : null}
        selectedHour={selectedHourOffset % 24}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sun</CardTitle>
            <CardDescription>Day length {formatDuration(data.sun.dayLengthMs)}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <Sunrise size={18} className="text-brand-400 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-ink-100 text-sm font-medium">{formatTime(data.sun.sunrise)}</p>
                <p className="text-ink-500 text-xs">Sunrise</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Sunset size={18} className="text-brand-400 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-ink-100 text-sm font-medium">{formatTime(data.sun.sunset)}</p>
                <p className="text-ink-500 text-xs">Sunset</p>
              </div>
            </div>
            <div>
              <p className="text-ink-100 text-sm font-medium">{formatTime(data.sun.dawn)}</p>
              <p className="text-ink-500 text-xs">Dawn</p>
            </div>
            <div>
              <p className="text-ink-100 text-sm font-medium">{formatTime(data.sun.dusk)}</p>
              <p className="text-ink-500 text-xs">Dusk</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Moon</CardTitle>
            <CardDescription>{data.illumination.phaseName}</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <MoonPhaseIcon phase={data.illumination.phase} waxing={data.illumination.waxing} size={48} />
            <div className="grid flex-1 grid-cols-2 gap-3">
              <div>
                <p className="text-ink-100 text-sm font-medium">
                  {Math.round(data.illumination.fraction * 100)}%
                </p>
                <p className="text-ink-500 text-xs">Illuminated</p>
              </div>
              <div className="flex items-center gap-1">
                <Moon size={14} className="text-ink-500" aria-hidden="true" />
                <span className="text-ink-500 text-xs">{data.illumination.waxing ? 'Waxing' : 'Waning'}</span>
              </div>
              <div>
                <p className="text-ink-100 text-sm font-medium">{formatTime(data.moon.rise)}</p>
                <p className="text-ink-500 text-xs">Moonrise</p>
              </div>
              <div>
                <p className="text-ink-100 text-sm font-medium">{formatTime(data.moon.set)}</p>
                <p className="text-ink-500 text-xs">Moonset</p>
              </div>
              <div className="flex items-center gap-1.5">
                <ArrowUpToLine size={14} className="text-status-success shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-ink-100 text-sm font-medium">{formatTime(data.moonTransit.overhead)}</p>
                  <p className="text-ink-500 text-xs">Overhead</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <ArrowDownToLine size={14} className="text-brand-400 shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-ink-100 text-sm font-medium">{formatTime(data.moonTransit.underfoot)}</p>
                  <p className="text-ink-500 text-xs">Underfoot</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Solunar periods</CardTitle>
          <CardDescription>
            Major periods (moon overhead/underfoot) and minor periods (near moonrise/moonset),
            per the public Solunar Theory geometry — not a proprietary activity score.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {data.solunarPeriods.map((period, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className={period.type === 'major' ? 'text-ink-100 font-medium' : 'text-ink-300'}>
                {period.type === 'major' ? 'Major' : 'Minor'}
              </span>
              <span className="text-ink-500 text-xs">
                {formatTime(period.start)} – {formatTime(period.end)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
