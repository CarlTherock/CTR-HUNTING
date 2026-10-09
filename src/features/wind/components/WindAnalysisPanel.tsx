import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Pause,
  Play,
  RefreshCw,
  X,
} from 'lucide-react'
import { useGuidanceStore } from '@/features/guidance/state/guidanceStore'
import { useBloodStore } from '@/features/blood/state/bloodStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { useWeatherMapStore } from '@/features/weather-map/state/weatherMapStore'
import { cn } from '@/utils/cn'
import { haversineMeters } from '@/utils/geo'
import type { Coordinate } from '@/types'
import type { LngLatBounds } from '@/utils/tiles'
import { HourTimeBar } from '../analysis/HourTimeBar'
import {
  analysisStatus,
  buildForecastDays,
  dayLabel,
  describeWind,
  findDayOfIndex,
  forecastAge,
  formatSlotTime,
  longDateLabel,
  shortDateLabel,
  nearestAvailableIndex,
  nowSlotIndex,
  readSlot,
  slotForDayChange,
  stepIndex,
  type ForecastDay,
  type ForecastSlot,
  type SlotReading,
} from '../analysis/windTimeline'
import { useWindAnalysisStore } from '../state/windAnalysisStore'
import { useWindStore } from '../state/windStore'

export interface WindAnalysisPanelProps {
  /** Map centre: the wind shown is that of the grid sample nearest to it. */
  viewCenter: Coordinate
  getBounds: () => LngLatBounds | null
}

const SHORT_LANDSCAPE = '(max-height: 480px)'

function useMediaQuery(query: string): boolean {
  const read = () => {
    try {
      return typeof window !== 'undefined' && window.matchMedia(query).matches
    } catch {
      return false
    }
  }
  const [matches, setMatches] = useState(read)
  useEffect(() => {
    let list: MediaQueryList
    try {
      list = window.matchMedia(query)
    } catch {
      return
    }
    const onChange = () => setMatches(list.matches)
    onChange()
    list.addEventListener?.('change', onChange)
    return () => list.removeEventListener?.('change', onChange)
  }, [query])
  return matches
}

function useNow(periodMs: number): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), periodMs)
    return () => clearInterval(timer)
  }, [periodMs])
  return now
}

function fetchedClock(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('fr-CA', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatKm(meters: number): string {
  return meters < 950
    ? `${Math.round(meters / 10) * 10} m`
    : `${(meters / 1000).toLocaleString('fr-CA', { maximumFractionDigits: 1 })} km`
}

function WindArrow({ toDegrees, size = 18 }: { toDegrees: number; size?: number }) {
  // Arrow points where the wind BLOWS TO (the way the particles flow).
  return (
    <ArrowUp
      size={size}
      aria-hidden="true"
      style={{ transform: `rotate(${toDegrees}deg)` }}
      className="text-brand-400 shrink-0"
    />
  )
}

function cardWindow(day: ForecastDay | null, selectedIndex: number): ForecastSlot[] {
  if (!day) return []
  const at = day.slots.findIndex((slot) => slot.index === selectedIndex)
  const size = 4
  const start = Math.max(0, Math.min(day.slots.length - size, (at === -1 ? 0 : at) - 1))
  return day.slots.slice(start, start + size)
}

/**
 * « Analyse du vent » — collapsible bottom panel of the map: pick a day and
 * an hour of the forecast, and the wind particles on the map follow it.
 *
 * It owns no time state: the selection is `windStore.selectedHourOffset`
 * (also read by the Météo page, the charts and the particle layer), so
 * every view shows the same hour. The values come from the real hourly
 * series of the loaded wind field; an hour without data is shown as such,
 * never replaced by the current wind. Sits in the map's bottom-left dock,
 * above the guidance / blood-search panels, so it never covers them.
 */
export function WindAnalysisPanel({ viewCenter, getBounds }: WindAnalysisPanelProps) {
  const open = useWindAnalysisStore((s) => s.open)
  const expandedPref = useWindAnalysisStore((s) => s.expanded)
  const setExpanded = useWindAnalysisStore((s) => s.setExpanded)
  const closePanel = useWindAnalysisStore((s) => s.closePanel)

  const field = useWindStore((s) => s.field)
  const status = useWindStore((s) => s.status)
  const fetchedAt = useWindStore((s) => s.fetchedAt)
  const fromCache = useWindStore((s) => s.fromCache)
  const errorReason = useWindStore((s) => s.errorReason)
  const windEnabled = useWindStore((s) => s.enabled)
  const toggleWind = useWindStore((s) => s.toggle)
  const fetchWind = useWindStore((s) => s.fetch)
  const selectedIndex = useWindStore((s) => s.selectedHourOffset)
  const setSelectedHourOffset = useWindStore((s) => s.setSelectedHourOffset)
  const paused = useWindStore((s) => s.animationPaused)
  const setPaused = useWindStore((s) => s.setAnimationPaused)

  const guidanceActive = useGuidanceStore((s) => s.destinationId !== null)
  const bloodActive = useBloodStore((s) =>
    s.sessions.some((x) => x.status !== 'finished'),
  )
  const editingWaypoint = useWaypointsStore(
    (s) => s.editingId !== null || s.draft !== null,
  )
  const shortLandscape = useMediaQuery(SHORT_LANDSCAPE)

  const now = useNow(30_000)
  const [showDetails, setShowDetails] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const days = useMemo(() => buildForecastDays(field, now), [field, now])
  const selectedDay = findDayOfIndex(days, selectedIndex)
  const displayDay = selectedDay ?? days[0] ?? null
  const slot = selectedDay?.slots.find((s) => s.index === selectedIndex) ?? null
  const nowIndex = nowSlotIndex(field, now)
  const reading: SlotReading = useMemo(
    () => readSlot(field, viewCenter, selectedIndex),
    [field, viewCenter, selectedIndex],
  )
  const description = reading.kind === 'ok' ? describeWind(reading.reading) : null
  const age = forecastAge(fetchedAt, now)
  const state = analysisStatus({
    hasField: field !== null,
    loading: status === 'loading',
    failed: status === 'error',
    fromCache,
  })

  // On opening, start at the current hour — unless the shared selection was
  // already moved on purpose (Météo page, charts…), in which case it is kept.
  // The untouched default (index 0 = midnight) or a slot the field does not
  // have is not a choice, so it is replaced by « maintenant » when available.
  const alignedRef = useRef(false)
  useEffect(() => {
    if (!open) {
      alignedRef.current = false
      return
    }
    if (alignedRef.current || !field) return
    alignedRef.current = true
    const at = new Date()
    const current = nowSlotIndex(field, at)
    const chosen = useWindStore.getState().selectedHourOffset
    const valid = findDayOfIndex(buildForecastDays(field, at), chosen) !== null
    if (current !== null && (chosen === 0 || !valid)) setSelectedHourOffset(current)
  }, [open, field, setSelectedHourOffset])

  // One bottom sheet at a time, decided here and nowhere else:
  //  - waypoint editor open, blood search in progress, or guidance on a short
  //    landscape screen → the analysis stays a one-line bar (the ‹ › hour
  //    buttons stay reachable) so « + Sang », « Arrêter le guidage » and the
  //    editor keep the room;
  //  - guidance on a taller screen → the analysis may open, and the guidance
  //    panel folds to its summary line (« Arrêter le guidage » stays on it).
  const forceCollapsed =
    editingWaypoint || bloodActive || (shortLandscape && guidanceActive)
  const expanded = expandedPref && !forceCollapsed
  useEffect(() => {
    if (open && expanded && guidanceActive) useGuidanceStore.getState().setCollapsed(true)
  }, [open, expanded, guidanceActive])

  if (!open) return null

  function pauseFramePlayback() {
    const weather = useWeatherMapStore.getState()
    if (weather.playing) weather.setPlaying(false)
  }

  function select(index: number) {
    pauseFramePlayback()
    setNotice(null)
    setSelectedHourOffset(index)
  }

  function step(delta: number) {
    const next = stepIndex(days, selectedIndex, delta)
    if (next !== null) select(next)
  }

  function goNow() {
    const index = nowSlotIndex(field, now)
    if (index === null || !days.some((d) => d.slots.some((s) => s.index === index))) {
      setNotice("L'heure actuelle n'est pas dans les prévisions chargées.")
      return
    }
    select(index)
  }

  function changeDay(day: ForecastDay) {
    const currentHour = slot?.hour ?? now.getHours()
    const change = slotForDayChange(day, currentHour)
    if (!change) return
    pauseFramePlayback()
    setSelectedHourOffset(change.index)
    setNotice(
      change.sameHour
        ? null
        : `${String(currentHour).padStart(2, '0')}:00 n'existe pas ${dayLabel(day).toLowerCase()} : ${String(change.hour).padStart(2, '0')}:00 sélectionné.`,
    )
  }

  function refresh() {
    const bounds = getBounds()
    if (bounds) void fetchWind(bounds)
  }

  const summaryWind = description
    ? `du ${description.fromLabel} · ${description.speedKmh} km/h`
    : state === 'loading'
      ? 'Chargement…'
      : state === 'unavailable'
        ? 'Indisponible'
        : 'Pas de donnée'

  const panelClass =
    '@container border-surface-600 bg-surface-900/95 text-ink-100 pointer-events-auto relative flex min-h-0 w-full shrink flex-col overflow-hidden rounded-lg border shadow-xl backdrop-blur-sm'

  const stepButtons = (
    <>
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={state === 'loading' || state === 'unavailable'}
        aria-label="Heure précédente"
        className="text-ink-300 hover:text-ink-100 flex size-11 shrink-0 items-center justify-center disabled:opacity-40"
      >
        <ChevronLeft size={20} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => step(1)}
        disabled={state === 'loading' || state === 'unavailable'}
        aria-label="Heure suivante"
        className="text-ink-300 hover:text-ink-100 flex size-11 shrink-0 items-center justify-center disabled:opacity-40"
      >
        <ChevronRight size={20} aria-hidden="true" />
      </button>
    </>
  )

  if (!expanded) {
    return (
      <section
        aria-label="Analyse du vent (repliée)"
        data-testid="wind-analysis"
        data-state="collapsed"
        className={panelClass}
      >
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            disabled={forceCollapsed}
            aria-label="Déplier l'analyse du vent"
            title={
              forceCollapsed
                ? 'Dépliable quand le repère, le guidage ou la recherche de sang laissent la place'
                : 'Déplier l’analyse du vent'
            }
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-3 py-1 text-left"
          >
            {description && <WindArrow toDegrees={description.toDegrees} />}
            <span className="min-w-0">
              <span className="block truncate text-sm leading-tight font-semibold tabular-nums">
                {slot ? (
                  <>
                    {formatSlotTime(slot.time)}{' '}
                    <span className="text-ink-300 text-xs font-normal">
                      {selectedDay ? dayLabel(selectedDay, true) : ''}
                    </span>
                  </>
                ) : (
                  'Analyse du vent'
                )}
              </span>
              <span className="text-ink-300 block truncate text-xs leading-tight">
                {summaryWind}
              </span>
            </span>
            {!forceCollapsed && (
              <ChevronUp
                size={16}
                className="text-ink-500 ml-auto shrink-0"
                aria-hidden="true"
              />
            )}
          </button>
          {stepButtons}
        </div>
      </section>
    )
  }

  const ready = state !== 'loading' && state !== 'unavailable'
  const valueText = slot
    ? `${selectedDay ? longDateLabel(selectedDay.dateKey) : ''}, ${formatSlotTime(slot.time)}${
        description
          ? `, vent du ${description.fromLabel}, ${description.speedKmh} kilomètres-heure`
          : ', aucune donnée'
      }`
    : 'Créneau absent des prévisions'
  const cards = cardWindow(displayDay, selectedIndex)

  return (
    <section
      aria-label="Analyse du vent"
      data-testid="wind-analysis"
      data-state="expanded"
      className={cn(
        panelClass,
        'max-h-[min(27rem,62dvh)] [@media(max-height:480px)]:max-h-[78dvh]',
      )}
    >
      {/* Poignée : repère visuel posé sur le bord haut (toucher la replie
          aussi) ; le vrai bouton, de 44 px, est le titre ci-dessous. */}
      <div
        onClick={() => setExpanded(false)}
        aria-hidden="true"
        className="absolute inset-x-0 top-0 z-10 flex h-3 cursor-pointer items-center justify-center [@media(max-height:480px)]:hidden"
      >
        <span className="bg-ink-500 h-1 w-10 rounded-full" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pt-1.5 pb-1 [@media(max-height:480px)]:pt-0">
        {/* Titre + fermer ; les jours passent sur la même ligne en paysage court. */}
        <div className="flex flex-wrap items-center gap-x-2">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-label="Replier l'analyse du vent"
            className="order-1 flex min-h-11 min-w-0 items-center gap-1 text-sm font-semibold whitespace-nowrap [@media(max-height:480px)]:min-w-11 [@media(max-height:480px)]:justify-center"
          >
            <span className="[@media(max-height:480px)]:hidden">Analyse du vent</span>
            <ChevronDown
              size={16}
              className="text-ink-500 hidden @[17rem]:block [@media(max-height:480px)]:block"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            onClick={closePanel}
            aria-label="Fermer l'analyse du vent"
            className="text-ink-500 hover:text-ink-100 order-2 ml-auto flex size-11 items-center justify-center [@media(max-height:480px)]:order-3"
          >
            <X size={18} aria-hidden="true" />
          </button>
          {days.length > 0 && (
            <div
              className="order-3 flex basis-full gap-1.5 py-0.5 [@media(max-height:480px)]:order-2 [@media(max-height:480px)]:basis-auto"
              role="group"
              aria-label="Jour de la prévision"
            >
              {days.map((day) => {
                const active = displayDay?.dateKey === day.dateKey
                return (
                  <button
                    key={day.dateKey}
                    type="button"
                    onClick={() => changeDay(day)}
                    aria-pressed={active}
                    className={cn(
                      'min-h-11 min-w-0 flex-1 rounded-md border px-2 text-xs font-medium transition-colors @[17rem]:flex-none @[17rem]:px-3 @[17rem]:text-sm [@media(max-height:480px)]:flex-none [@media(max-height:480px)]:px-2! [@media(max-height:480px)]:text-xs!',
                      active
                        ? 'border-brand-400 bg-brand-500/20 text-brand-300'
                        : 'border-surface-600 text-ink-300 hover:bg-surface-800',
                    )}
                  >
                    {dayLabel(day)}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {state === 'loading' && (
          <p role="status" className="text-ink-300 py-2 text-sm">
            Chargement des prévisions de vent… La carte n’affiche pas encore l’heure
            choisie.
          </p>
        )}
        {state === 'unavailable' && (
          <div role="status" className="py-2 text-sm">
            <p className="text-status-danger">
              Prévisions de vent indisponibles
              {errorReason ? ` (${errorReason})` : ''}. Aucune valeur n’est affichée.
            </p>
            <button
              type="button"
              onClick={refresh}
              className="border-surface-600 mt-2 flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-xs"
            >
              <RefreshCw size={14} aria-hidden="true" />
              Réessayer
            </button>
          </div>
        )}
        {state === 'cached' && (
          <p role="status" className="text-status-warning py-1 text-xs">
            Hors ligne : copie enregistrée le {fetchedClock(fetchedAt)}
            {age ? ` (${age.label})` : ''}. Elle peut ne plus refléter la prévision
            actuelle.
          </p>
        )}
        {state === 'refresh-failed' && (
          <p role="status" className="text-status-warning py-1 text-xs">
            Actualisation impossible : valeurs récupérées le {fetchedClock(fetchedAt)}
            {age ? ` (${age.label})` : ''}.
          </p>
        )}
        {state === 'refreshing' && (
          <p role="status" className="text-ink-300 py-1 text-xs">
            Mise à jour des prévisions… Les valeurs affichées datent du{' '}
            {fetchedClock(fetchedAt)}.
          </p>
        )}
        {state === 'ready' && age?.stale && (
          <p role="status" className="text-status-warning py-1 text-xs">
            Prévisions anciennes ({age.label}).
          </p>
        )}

        {ready && !windEnabled && (
          <p className="text-ink-300 py-1 text-xs">
            Les traits de vent sont désactivés sur la carte.{' '}
            <button
              type="button"
              className="text-brand-300 min-h-11 underline"
              onClick={() => {
                const bounds = getBounds()
                if (bounds) toggleWind(bounds)
              }}
            >
              Les afficher
            </button>
          </p>
        )}

        {ready && (
          <div
            aria-live="polite"
            data-testid="wind-readout"
            className="flex flex-wrap items-center gap-x-2 py-0.5"
          >
            <p className="text-ink-300 order-1 min-w-0 text-xs tabular-nums">
              {slot && selectedDay ? (
                <>
                  <span className="[@media(max-height:480px)]:hidden">
                    <span className="@[17rem]:hidden">
                      {shortDateLabel(selectedDay.dateKey)}
                    </span>
                    <span className="hidden @[17rem]:inline">
                      {longDateLabel(selectedDay.dateKey)}
                    </span>{' '}
                    ·{' '}
                  </span>
                  <span className="text-ink-100 text-base font-semibold">
                    {formatSlotTime(slot.time)}
                  </span>
                </>
              ) : (
                'Créneau absent'
              )}
            </p>
            <button
              type="button"
              onClick={goNow}
              aria-label="Maintenant"
              className="border-surface-600 text-ink-100 hover:bg-surface-800 order-2 ml-auto flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium [@media(max-height:480px)]:order-3 [@media(max-height:480px)]:min-w-11 [@media(max-height:480px)]:justify-center"
            >
              <Clock
                size={14}
                aria-hidden="true"
                className="hidden @[17rem]:block [@media(max-height:480px)]:block"
              />
              <span className="[@media(max-height:480px)]:hidden">Maintenant</span>
            </button>
            {slot && selectedDay ? (
              description ? (
                <div className="order-3 flex basis-full items-center gap-2 [@media(max-height:480px)]:order-2 [@media(max-height:480px)]:basis-auto">
                  <WindArrow toDegrees={description.toDegrees} size={26} />
                  <p className="hidden text-xs font-semibold tabular-nums [@media(max-height:480px)]:block">
                    {description.fromLabel} · {description.speedKmh} km/h
                    {description.gustsKmh !== null && (
                      <span className="hidden @[24rem]:inline">
                        {' '}
                        (raf. {description.gustsKmh})
                      </span>
                    )}
                  </p>
                  <div className="[@media(max-height:480px)]:hidden">
                    <p className="text-base leading-tight font-semibold">
                      Vent du {description.fromLabel}{' '}
                      <span className="text-ink-300 text-sm font-normal">
                        ({description.fromDegrees}°)
                      </span>
                    </p>
                    <p className="text-ink-100 text-sm tabular-nums">
                      {description.speedKmh} km/h
                      {description.gustsKmh !== null
                        ? `, rafales ${description.gustsKmh} km/h`
                        : ''}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-status-warning order-3 basis-full text-sm">
                  Aucune donnée de vent pour ce créneau.
                </p>
              )
            ) : (
              <p className="text-status-warning order-3 basis-full text-sm">
                Ce créneau n’existe pas dans les prévisions chargées.{' '}
                <button
                  type="button"
                  className="text-brand-300 min-h-11 underline"
                  onClick={() => {
                    const index = nearestAvailableIndex(days, selectedIndex)
                    if (index !== null) select(index)
                  }}
                >
                  Aller au créneau le plus proche
                </button>
              </p>
            )}
          </div>
        )}

        {notice && (
          <p role="status" className="text-status-warning pb-1 text-xs">
            {notice}
          </p>
        )}

        {displayDay && (
          <HourTimeBar
            slots={displayDay.slots}
            selectedIndex={selectedIndex}
            nowIndex={
              nowIndex !== null && displayDay.slots.some((s) => s.index === nowIndex)
                ? nowIndex
                : null
            }
            disabled={!ready}
            valueText={valueText}
            onSelect={select}
            onStep={step}
            onEdge={(edge) => {
              const slots = displayDay.slots
              select(edge === 'start' ? slots[0].index : slots[slots.length - 1].index)
            }}
          />
        )}

        {ready && cards.length > 0 && (
          <ul
            className="mt-1 flex gap-1.5 pb-1 [@media(max-height:640px)]:hidden"
            aria-label="Heures proches"
          >
            {cards.map((card) => {
              const cardReading = readSlot(field, viewCenter, card.index)
              const d =
                cardReading.kind === 'ok' ? describeWind(cardReading.reading) : null
              const active = card.index === selectedIndex
              return (
                <li key={card.index} className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => select(card.index)}
                    aria-pressed={active}
                    aria-label={`${formatSlotTime(card.time)} : ${
                      d ? `vent du ${d.fromLabel}, ${d.speedKmh} km/h` : 'aucune donnée'
                    }`}
                    className={cn(
                      'flex min-h-[4.25rem] w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-md border px-1 py-1 text-[11px] tabular-nums',
                      active
                        ? 'border-brand-400 bg-brand-500/15 text-ink-100'
                        : 'border-surface-700 bg-surface-800/60 text-ink-300',
                    )}
                  >
                    {d ? <WindArrow toDegrees={d.toDegrees} size={16} /> : <span>—</span>}
                    <span className="font-medium">{d ? d.fromLabel : '—'}</span>
                    <span>{d ? `${d.speedKmh} km/h` : ''}</span>
                    <span className="text-ink-500">{formatSlotTime(card.time)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <div className="border-surface-700 flex items-center justify-between gap-2 border-t">
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            aria-expanded={showDetails}
            aria-label="Source et détails"
            className="text-ink-300 min-h-11 min-w-11 px-1 text-xs underline"
          >
            <span className="@[17rem]:hidden">Détails</span>
            <span className="hidden @[17rem]:inline">Source et détails</span>
          </button>
          <button
            type="button"
            onClick={() => setPaused(!paused)}
            aria-pressed={!paused}
            disabled={!windEnabled}
            className="border-surface-600 text-ink-300 flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-xs disabled:opacity-40"
          >
            {paused ? (
              <Play size={14} aria-hidden="true" />
            ) : (
              <Pause size={14} aria-hidden="true" />
            )}
            <span className="@[17rem]:hidden">{paused ? 'Animer' : 'Figer'}</span>
            <span className="hidden @[17rem]:inline">
              {paused ? 'Animer les traits' : 'Figer les traits'}
            </span>
          </button>
        </div>

        {showDetails && (
          <div data-testid="wind-details" className="text-ink-300 space-y-1 pt-1 text-xs">
            <p>
              <span className="text-ink-100">Source :</span> Open-Meteo (modèle météo),
              une valeur par heure, heure locale.
            </p>
            <p>
              <span className="text-ink-100">Récupérées :</span>{' '}
              {fetchedAt
                ? `${fetchedClock(fetchedAt)}${age ? ` (${age.label})` : ''}${fromCache ? ', copie enregistrée' : ''}`
                : 'jamais'}
              .
            </p>
            {reading.kind === 'ok' && (
              <p>
                <span className="text-ink-100">Point utilisé :</span> l’échantillon de la
                grille 5 × 5 le plus proche du centre de la carte, à{' '}
                {formatKm(haversineMeters(viewCenter, reading.sampleCoordinate))} (aucune
                interpolation).
              </p>
            )}
            <p>
              <span className="text-ink-100">Rendu indicatif :</span> les traits suivent
              la direction et la vitesse de cet échantillon, avec une vitesse exagérée
              pour rester lisible. Ils ne montrent ni le vent local entre les arbres ni
              l’effet du relief.
            </p>
            <p>
              <span className="text-ink-100">Texte et traits :</span> le texte dit d’où
              vient le vent ; les traits et la flèche vont vers où il souffle. Les points
              cardinaux sont géographiques, même si la carte est tournée.
            </p>
            <p>
              <span className="text-ink-100">Heure et animation :</span> figer ou animer
              les traits ne change pas l’heure ; seule la barre ci-dessus choisit l’heure
              de prévision.
            </p>
            <button
              type="button"
              onClick={refresh}
              className="border-surface-600 text-ink-100 flex min-h-11 items-center gap-1.5 rounded-full border px-3"
            >
              <RefreshCw size={14} aria-hidden="true" />
              Actualiser les prévisions
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
