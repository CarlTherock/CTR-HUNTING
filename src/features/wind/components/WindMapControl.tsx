import { useEffect, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  LineChart,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Wind,
  X,
} from 'lucide-react'
import { ToolTrigger } from '@/components/map-tools'
import { useGuidanceDestination } from '@/features/guidance/state/guidanceStore'
import { useIsWide } from '@/features/compare/useIsWide'
import { useWeatherMapStore } from '@/features/weather-map/state/weatherMapStore'
import { useWindStyleStore } from '@/features/weather-map/state/windStyleStore'
import { WindStyleSettings } from '@/features/weather-map/components/WindStyleSettings'
import { windSync } from '@/features/weather-map/windSync'
import type { Coordinate } from '@/types'
import type { LngLatBounds } from '@/utils/tiles'
import { cn } from '@/utils/cn'
import {
  allSlots,
  buildForecastDays,
  describeWind,
  findDayOfIndex,
  forecastAge,
  formatSlotTime,
  nearestAvailableIndex,
  nowSlotIndex,
  readSlot,
  shortDateLabel,
  stepIndex,
} from '../analysis/windTimeline'
import { useWindAnalysisStore } from '../state/windAnalysisStore'
import { useWindPanelStore } from '../state/windPanelStore'
import { useWindStore } from '../state/windStore'
import { WindCompass } from './WindCompass'

export interface WindMapControlProps {
  getBounds: () => LngLatBounds | null
  viewCenter: Coordinate
}

/**
 * Dedicated « Vent » panel: the animated particles driven by the REAL
 * Open-Meteo wind forecast (a grid of real points), with its own hour
 * control, the reading at the map center, and the presentation settings
 * (size, thickness, density, contrast). The HRDPS « Vent » raster of the
 * weather panel is a different source and stays there.
 */
export function WindMapControl({ getBounds, viewCenter }: WindMapControlProps) {
  const panelOpen = useWindPanelStore((s) => s.open)
  const guiding = useGuidanceDestination() !== null
  const setPanelOpen = useWindPanelStore((s) => s.setOpen)
  const enabled = useWindStore((s) => s.enabled)
  const toggleWind = useWindStore((s) => s.toggle)
  const fetchWind = useWindStore((s) => s.fetch)
  const status = useWindStore((s) => s.status)
  const errorReason = useWindStore((s) => s.errorReason)
  const field = useWindStore((s) => s.field)
  const fetchedAt = useWindStore((s) => s.fetchedAt)
  const fromCache = useWindStore((s) => s.fromCache)
  const hour = useWindStore((s) => s.selectedHourOffset)
  const setHour = useWindStore((s) => s.setSelectedHourOffset)
  const paused = useWindStore((s) => s.animationPaused)
  const setPaused = useWindStore((s) => s.setAnimationPaused)

  const style = useWindStyleStore((s) => s.style)
  const updateStyle = useWindStyleStore((s) => s.update)

  const analysisOpen = useWindAnalysisStore((s) => s.open)
  const openAnalysis = useWindAnalysisStore((s) => s.openPanel)

  const weatherEnabled = useWeatherMapStore((s) => s.enabled)
  const weatherFrame = useWeatherMapStore((s) => s.frames[s.frameIndex] ?? null)
  const setWeatherEnabled = useWeatherMapStore((s) => s.setEnabled)

  const [expanded, setExpanded] = useState(true)
  const wide = useIsWide()
  const now = new Date()

  const days = buildForecastDays(field, now)
  const slots = allSlots(days)
  const current = slots.find((slot) => slot.index === hour) ?? null
  const day = findDayOfIndex(days, hour)
  const read = readSlot(field, viewCenter, hour)
  const described = read.kind === 'ok' ? describeWind(read.reading) : null
  const age = forecastAge(fetchedAt, now)
  const nowIndex = nowSlotIndex(field, now)
  const sync = weatherEnabled ? windSync(field, weatherFrame?.time ?? null, hour) : null

  // The hour cursor starts at 0 (midnight, the first slot of the series).
  // Opening the wind panel on that untouched default shows the wind NOW; a
  // deliberate choice (any other hour) is never overridden.
  const startNowIndex = field ? nowSlotIndex(field, new Date()) : null
  useEffect(() => {
    if (!panelOpen || startNowIndex === null || startNowIndex === 0) return
    if (useWindStore.getState().selectedHourOffset === 0) setHour(startNowIndex)
  }, [panelOpen, field, startNowIndex, setHour])

  function ensureWind() {
    const bounds = getBounds()
    if (bounds && !useWindStore.getState().enabled) toggleWind(bounds)
  }

  /** The rail button opens the panel and, like « Météo et radar », makes the
   * thing visible at once: opening it switches the particles on. */
  function handleRail() {
    if (analysisOpen) {
      useWindAnalysisStore.getState().closePanel()
      setPanelOpen(true)
      ensureWind()
      return
    }
    if (panelOpen) {
      setPanelOpen(false)
      return
    }
    // One bottom panel at a time: the weather panel gives way (its layer
    // stays on the map).
    setPanelOpen(true)
    ensureWind()
  }

  function handleOpenAnalysis() {
    ensureWind()
    openAnalysis()
  }

  const readout = (
    <p
      className="text-ink-100 text-sm font-semibold tabular-nums"
      data-testid="wind-hour-readout"
    >
      {day && current
        ? `${shortDateLabel(day.dateKey)} · ${formatSlotTime(current.time)}`
        : 'Heure indisponible'}
    </p>
  )

  const hourControls =
    slots.length > 0 ? (
      <div data-testid="wind-hour-controls">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          {readout}
          <button
            type="button"
            disabled={nowIndex === null}
            onClick={() => nowIndex !== null && setHour(nowIndex)}
            className="border-surface-600 text-ink-300 rounded-full border px-2.5 py-1 text-xs disabled:opacity-40 pointer-coarse:min-h-11"
          >
            Maintenant
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              const next = stepIndex(days, hour, -1)
              if (next !== null) setHour(next)
            }}
            aria-label="Heure précédente"
            className="text-ink-300 flex size-9 shrink-0 items-center justify-center pointer-coarse:size-11"
          >
            <SkipBack size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setPaused(!paused)}
            aria-label={paused ? 'Lecture du vent' : 'Pause du vent'}
            className="bg-brand-500 text-surface-950 flex size-9 shrink-0 items-center justify-center rounded-full pointer-coarse:size-11"
          >
            {paused ? (
              <Play size={18} aria-hidden="true" />
            ) : (
              <Pause size={18} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              const next = stepIndex(days, hour, 1)
              if (next !== null) setHour(next)
            }}
            aria-label="Heure suivante"
            className="text-ink-300 flex size-9 shrink-0 items-center justify-center pointer-coarse:size-11"
          >
            <SkipForward size={18} aria-hidden="true" />
          </button>
          <input
            type="range"
            min={slots[0].index}
            max={slots[slots.length - 1].index}
            value={hour}
            onChange={(e) => {
              const next = nearestAvailableIndex(days, Number(e.target.value))
              if (next !== null) setHour(next)
            }}
            aria-label="Heure du vent"
            aria-valuetext={
              day && current
                ? `${shortDateLabel(day.dateKey)}, ${formatSlotTime(current.time)}`
                : undefined
            }
            className="accent-brand-500 h-9 min-w-0 flex-1 pointer-coarse:h-11"
          />
        </div>
        <p className="text-ink-500 mt-1 text-[11px]">
          Prévision de vent sur {days.length} jour{days.length > 1 ? 's' : ''} · une
          valeur par heure
        </p>
      </div>
    ) : null

  const reading = (
    <div className="flex items-center gap-3" data-testid="wind-center-reading">
      {read.kind === 'ok' && described ? (
        <>
          <WindCompass
            directionDegrees={read.reading.directionDegrees}
            speedKmh={read.reading.speedKmh}
            size={96}
          />
          <p className="text-ink-100 text-sm">
            Vent du {described.fromLabel} ({described.fromDegrees}°)
            <span className="block text-lg font-semibold">{described.speedKmh} km/h</span>
            <span className="text-ink-300 block text-xs">
              rafales{' '}
              {described.gustsKmh === null
                ? 'indisponibles'
                : `${described.gustsKmh} km/h`}
            </span>
            <span className="text-ink-500 block text-[11px]">
              Au centre de la carte · point de grille le plus proche (Open-Meteo)
            </span>
          </p>
        </>
      ) : (
        <p className="text-ink-500 text-xs">
          {field
            ? 'Vent indisponible pour cette heure au centre de la carte.'
            : 'Aucune prévision de vent chargée.'}
        </p>
      )}
    </div>
  )

  const statusLine = (
    <>
      {status === 'loading' && (
        <p className="text-ink-500 text-xs">Chargement du vent…</p>
      )}
      {status === 'error' && (
        <p className="text-status-danger text-xs">
          Vent indisponible{errorReason ? ` — ${errorReason}` : ''}.{' '}
          <button
            type="button"
            className="underline"
            onClick={() => {
              const bounds = getBounds()
              if (bounds) void fetchWind(bounds)
            }}
          >
            Réessayer
          </button>
        </p>
      )}
      {field && age && (
        <p
          className={cn(
            'text-[11px]',
            age.stale ? 'text-status-warning' : 'text-ink-500',
          )}
        >
          {fromCache ? 'Copie gardée sur l’appareil · ' : ''}Prévision de vent {age.label}
          {age.stale ? ' — ancienne' : ''}
        </p>
      )}
      {sync?.state === 'out-of-range' && (
        <p className="text-status-warning text-xs" data-testid="wind-sync">
          La couche météo active est à une heure hors de la prévision de vent : le vent
          reste à {sync.windHourLabel}.
        </p>
      )}
      {sync?.state === 'synced' && (
        <p className="text-ink-500 text-xs" data-testid="wind-sync">
          La couche météo active suit la même heure ({sync.windHourLabel}).{' '}
          <button
            type="button"
            className="underline"
            onClick={() => setWeatherEnabled(false)}
          >
            Retirer la couche météo
          </button>
        </p>
      )}
    </>
  )

  const body = (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => {
          const bounds = getBounds()
          if (bounds) toggleWind(bounds)
        }}
        aria-pressed={enabled}
        className={cn(
          'flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold pointer-coarse:min-h-11',
          enabled
            ? 'border-brand-400 bg-brand-500/20 text-brand-300'
            : 'border-surface-600 text-ink-300',
        )}
      >
        <Wind size={16} aria-hidden="true" />
        Particules de vent {enabled ? '· activées' : '· désactivées'}
      </button>
      {statusLine}
      {reading}
      <button
        type="button"
        onClick={handleOpenAnalysis}
        className="border-brand-400 bg-brand-500/20 text-brand-300 flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm pointer-coarse:min-h-11"
      >
        <LineChart size={16} aria-hidden="true" />
        Analyse du vent
      </button>
      <section className="border-surface-700 flex flex-col gap-2 border-t pt-3">
        <p className="text-ink-500 text-[11px] font-semibold tracking-wide uppercase">
          Présentation
        </p>
        <WindStyleSettings style={style} onChange={(patch) => void updateStyle(patch)} />
      </section>
    </div>
  )

  const closeButton = (
    <button
      type="button"
      onClick={() => setPanelOpen(false)}
      aria-label="Fermer le panneau du vent"
      className="text-ink-500 hover:text-ink-100 flex items-center justify-center pointer-coarse:size-11"
    >
      <X size={16} aria-hidden="true" />
    </button>
  )

  const panelVisible = panelOpen && !analysisOpen

  return (
    <>
      {(!guiding || panelOpen) && (
        <ToolTrigger
          placement="rail"
          label="Vent"
          title="Vent : particules, heure, réglages"
          icon={<Wind size={20} aria-hidden="true" />}
          onClick={handleRail}
          pressed={panelOpen}
          active={panelOpen}
          order={31}
          secondary
        />
      )}

      {panelVisible && wide && (
        <aside
          data-testid="wind-side-panel"
          aria-label="Vent : particules, heure et réglages"
          className="border-surface-600 bg-surface-900/95 fixed top-24 bottom-3 left-[17rem] z-30 flex w-80 flex-col gap-2 rounded-lg border p-3 shadow-2xl backdrop-blur"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-ink-100 text-sm font-semibold">Vent</h2>
            <div className="flex items-center gap-2">
              <span className="text-ink-500 text-[10px]">
                Prévision réelle · Open-Meteo
              </span>
              {closeButton}
            </div>
          </div>
          {hourControls}
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">{body}</div>
        </aside>
      )}

      {panelVisible && !wide && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div
            data-testid="wind-bottom-panel"
            className="border-surface-600 bg-surface-900/95 w-full max-w-md rounded-lg border p-3 shadow-2xl backdrop-blur"
          >
            <div className="flex items-center justify-between gap-2">
              {expanded ? (
                <h2 className="text-ink-100 text-sm font-semibold">Vent</h2>
              ) : (
                <p
                  className="text-ink-100 flex min-w-0 items-center gap-2 text-sm font-semibold"
                  data-testid="wind-compact"
                >
                  <Wind
                    size={18}
                    aria-hidden="true"
                    className="text-brand-300 shrink-0"
                  />
                  <span className="truncate">
                    {day && current ? `${formatSlotTime(current.time)}` : 'Vent'}
                    {described && (
                      <span className="text-ink-300 font-normal tabular-nums">
                        {' · '}
                        {described.speedKmh} km/h du {described.fromLabel}
                      </span>
                    )}
                  </span>
                </p>
              )}
              <div className="flex shrink-0 items-center gap-1">
                {expanded && (
                  <span className="text-ink-500 text-[10px]">
                    Prévision réelle · Open-Meteo
                  </span>
                )}
                {!expanded && (
                  <button
                    type="button"
                    onClick={() => setPaused(!paused)}
                    aria-label={paused ? 'Lecture du vent' : 'Pause du vent'}
                    className="bg-brand-500 text-surface-950 flex size-9 items-center justify-center rounded-full pointer-coarse:size-11"
                  >
                    {paused ? (
                      <Play size={18} aria-hidden="true" />
                    ) : (
                      <Pause size={18} aria-hidden="true" />
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setExpanded(!expanded)}
                  aria-expanded={expanded}
                  aria-label={
                    expanded ? 'Réduire le panneau du vent' : 'Déplier le panneau du vent'
                  }
                  className="text-ink-300 flex size-9 items-center justify-center pointer-coarse:size-11"
                >
                  {expanded ? (
                    <ChevronDown size={18} aria-hidden="true" />
                  ) : (
                    <ChevronUp size={18} aria-hidden="true" />
                  )}
                </button>
                {closeButton}
              </div>
            </div>
            {expanded && (
              <>
                <div className="mt-2 mb-2">{hourControls}</div>
                <div className="max-h-[34vh] overflow-y-auto pr-1">{body}</div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
