import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from 'react'
import {
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Info,
  Pause,
  Play,
  RefreshCw,
  X,
} from 'lucide-react'
import { useImmersiveStore } from '@/components/layout/immersiveStore'
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
 * « Analyse du vent » — full-width bottom sheet of the map: pick a day and an
 * hour of the forecast, and the wind particles on the map follow it.
 *
 * Layout: anchored to the bottom edge of the map area (safe area included),
 * across its whole width — it is NOT a column of the bottom-left dock. While
 * it is open the app shell hides the bottom navigation (the sheet takes its
 * place) and the tool rail keeps only its essential buttons above it. Three
 * positions: collapsed (one line), open (days, hour, wind, time bar — about a
 * third of a portrait screen) and details (source, age, explanation) on
 * demand. The handle can be dragged; the title and the ‹ › buttons do the
 * same without a gesture.
 *
 * It owns no time state: the selection is `windStore.selectedHourOffset`
 * (also read by the Météo page, the charts and the particle layer), so
 * every view shows the same hour. The values come from the real hourly
 * series of the loaded wind field; an hour without data is shown as such,
 * never replaced by the current wind.
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

  // Report the sheet's height so the map page can keep its rail, the
  // attributions and the other bottom panels clear of it.
  const immersive = useImmersiveStore((s) => s.immersive)
  const setSheetHeight = useWindAnalysisStore((s) => s.setSheetHeight)
  const [rootEl, setRootEl] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (!open || !rootEl) return
    const measure = () => setSheetHeight(Math.ceil(rootEl.getBoundingClientRect().height))
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(rootEl)
    return () => observer.disconnect()
  }, [open, rootEl, setSheetHeight])
  // Most height changes come from a re-render (field arrived, details opened,
  // text wrapped differently): measure right after each one instead of waiting
  // for the observer, which is delivered with the next frame and can lag on a
  // busy map. The observer above still covers changes with no re-render.
  useLayoutEffect(() => {
    if (open && rootEl) setSheetHeight(Math.ceil(rootEl.getBoundingClientRect().height))
  })

  const dragStartY = useRef<number | null>(null)
  const dayRefs = useRef(new Map<string, HTMLButtonElement>())
  const displayDateKey = displayDay?.dateKey ?? null
  useEffect(() => {
    if (!open || !displayDateKey) return
    dayRefs.current.get(displayDateKey)?.scrollIntoView?.({
      block: 'nearest',
      inline: 'nearest',
    })
  }, [open, expanded, displayDateKey])

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

  function moveHandle(direction: 'up' | 'down') {
    if (direction === 'up') {
      if (!expanded) {
        if (!forceCollapsed) setExpanded(true)
      } else setShowDetails(true)
    } else if (showDetails) setShowDetails(false)
    else setExpanded(false)
  }

  function onHandleDown(event: PointerEvent<HTMLDivElement>) {
    dragStartY.current = event.clientY
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function onHandleUp(event: PointerEvent<HTMLDivElement>) {
    const start = dragStartY.current
    dragStartY.current = null
    if (start === null) return
    const delta = event.clientY - start
    if (delta <= -24) moveHandle('up')
    else if (delta >= 24) moveHandle('down')
    else if (expanded) setExpanded(false)
    else if (!forceCollapsed) setExpanded(true)
  }

  const loadingOrOff = state === 'loading' || state === 'unavailable'
  const ready = !loadingOrOff
  const compact = shortLandscape

  const rootClass = cn(
    '@container border-surface-600 bg-surface-900 text-ink-100 pointer-events-auto absolute inset-x-0 bottom-0 z-[25] flex flex-col border-t shadow-2xl',
    compact ? 'max-h-[80dvh] rounded-t-lg' : 'max-h-[min(58dvh,34rem)] rounded-t-2xl',
    // With the bottom navigation hidden, the sheet owns the home-indicator
    // inset — except in immersive mode (the app shell already pads the
    // screen edge) and from `md` up, where the map card sits inside a 1.5 rem
    // page margin that already clears it.
    !immersive && 'pb-[env(safe-area-inset-bottom)] md:pb-0',
  )

  const stepButtons = (
    <>
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={loadingOrOff}
        aria-label="Heure précédente"
        className="text-ink-300 hover:text-ink-100 flex size-11 shrink-0 items-center justify-center disabled:opacity-40"
      >
        <ChevronLeft size={20} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => step(1)}
        disabled={loadingOrOff}
        aria-label="Heure suivante"
        className="text-ink-300 hover:text-ink-100 flex size-11 shrink-0 items-center justify-center disabled:opacity-40"
      >
        <ChevronRight size={20} aria-hidden="true" />
      </button>
    </>
  )

  const closeButton = (
    <button
      type="button"
      onClick={closePanel}
      aria-label="Fermer l'analyse du vent"
      className="text-ink-500 hover:text-ink-100 flex size-11 shrink-0 items-center justify-center"
    >
      <X size={18} aria-hidden="true" />
    </button>
  )

  const handle = (
    <div
      aria-hidden="true"
      onPointerDown={onHandleDown}
      onPointerUp={onHandleUp}
      onPointerCancel={() => (dragStartY.current = null)}
      data-testid="wind-handle"
      className="flex h-4 shrink-0 cursor-grab touch-none items-center justify-center"
    >
      <span className="bg-ink-500 h-1 w-10 rounded-full" />
    </div>
  )

  if (!expanded) {
    return (
      <section
        ref={setRootEl}
        aria-label="Analyse du vent (repliée)"
        data-testid="wind-analysis"
        data-state="collapsed"
        className={rootClass}
      >
        {!compact && handle}
        <div className="flex items-center px-1">
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
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-2 py-1 text-left"
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
          {closeButton}
        </div>
      </section>
    )
  }

  const valueText = slot
    ? `${selectedDay ? longDateLabel(selectedDay.dateKey) : ''}, ${formatSlotTime(slot.time)}${
        description
          ? `, vent du ${description.fromLabel}, ${description.speedKmh} kilomètres-heure`
          : ', aucune donnée'
      }`
    : 'Créneau absent des prévisions'
  const cards = cardWindow(displayDay, selectedIndex)

  const detailsButton = (
    <button
      type="button"
      onClick={() => setShowDetails(!showDetails)}
      aria-expanded={showDetails}
      aria-label="Source et détails"
      className="text-ink-300 hover:text-ink-100 flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-2 text-xs"
    >
      <Info size={16} aria-hidden="true" />
      <span className="hidden @[26rem]:inline">Détails</span>
    </button>
  )
  const freezeButton = (
    <button
      type="button"
      onClick={() => setPaused(!paused)}
      aria-pressed={!paused}
      aria-label={paused ? 'Animer les traits' : 'Figer les traits'}
      disabled={!windEnabled}
      className="border-surface-600 text-ink-300 flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full border px-2 text-xs disabled:opacity-40"
    >
      {paused ? (
        <Play size={14} aria-hidden="true" />
      ) : (
        <Pause size={14} aria-hidden="true" />
      )}
      <span className="hidden @[26rem]:inline">{paused ? 'Animer' : 'Figer'}</span>
    </button>
  )
  const nowButton = (
    <button
      type="button"
      onClick={goNow}
      aria-label="Maintenant"
      className="border-surface-600 text-ink-100 hover:bg-surface-800 flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full border px-2.5 text-xs font-medium"
    >
      <Clock size={14} aria-hidden="true" />
      <span className={compact ? 'hidden' : 'hidden @[22rem]:inline'}>Maintenant</span>
    </button>
  )
  const collapseButton = (
    <button
      type="button"
      onClick={() => setExpanded(false)}
      aria-label="Replier l'analyse du vent"
      className={cn(
        'flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold whitespace-nowrap',
        compact ? 'min-w-11 justify-center' : 'pr-1',
      )}
    >
      {!compact && <span>Analyse du vent</span>}
      <ChevronDown size={16} className="text-ink-500" aria-hidden="true" />
    </button>
  )
  const dayChips =
    days.length > 0 ? (
      <div
        role="group"
        aria-label="Jour de la prévision"
        data-testid="wind-days"
        className={cn(
          'flex min-w-0 [scrollbar-width:none] gap-1.5 overflow-x-auto py-0.5',
          'flex-1',
        )}
      >
        {days.map((day) => {
          const active = displayDay?.dateKey === day.dateKey
          return (
            <button
              key={day.dateKey}
              ref={(node) => {
                if (node) dayRefs.current.set(day.dateKey, node)
                else dayRefs.current.delete(day.dateKey)
              }}
              type="button"
              onClick={() => changeDay(day)}
              aria-pressed={active}
              className={cn(
                'min-h-11 min-w-fit flex-1 shrink-0 rounded-md border px-2 text-xs font-medium whitespace-nowrap transition-colors @[26rem]:text-sm',
                active
                  ? 'border-brand-400 bg-brand-500/20 text-brand-300'
                  : 'border-surface-600 text-ink-300 hover:bg-surface-800',
              )}
            >
              {dayLabel(day, true)}
            </button>
          )
        })}
      </div>
    ) : null

  const notices = (
    <>
      {state === 'loading' && (
        <p role="status" className="text-ink-300 py-2 text-sm">
          Chargement des prévisions de vent… La carte n’affiche pas encore l’heure
          choisie.
        </p>
      )}
      {state === 'unavailable' && (
        <div role="status" className="py-1 text-sm">
          <p className="text-status-danger">
            Prévisions de vent indisponibles
            {errorReason ? ` (${errorReason})` : ''}. Aucune valeur n’est affichée.
          </p>
          <button
            type="button"
            onClick={refresh}
            className="border-surface-600 mt-1 flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-xs"
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
      {notice && (
        <p role="status" className="text-status-warning pb-1 text-xs">
          {notice}
        </p>
      )}
    </>
  )

  // One line: hour · origin direction · speed · gusts. Origin direction in
  // words (« Vent du SSO »); the arrow shows where the wind blows TO.
  const readout = ready && (
    <div
      aria-live="polite"
      data-testid="wind-readout"
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 py-0.5 tabular-nums"
    >
      {slot && selectedDay ? (
        <>
          <span className="text-base font-semibold">{formatSlotTime(slot.time)}</span>
          {description ? (
            <>
              <WindArrow toDegrees={description.toDegrees} size={20} />
              <span className="text-sm font-semibold">
                Vent du {description.fromLabel}{' '}
                <span className="text-ink-300 font-normal">
                  ({description.fromDegrees}°)
                </span>
              </span>
              <span className="text-sm">{description.speedKmh} km/h</span>
              {description.gustsKmh !== null && (
                <span className="text-ink-300 text-sm">
                  rafales {description.gustsKmh} km/h
                </span>
              )}
            </>
          ) : (
            <span className="text-status-warning text-sm">
              Aucune donnée de vent pour ce créneau.
            </span>
          )}
        </>
      ) : (
        <span className="text-status-warning text-sm">
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
        </span>
      )}
    </div>
  )

  const timeBar = displayDay && (
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
  )

  const hourCards = ready && cards.length > 0 && (
    <ul className="hidden gap-1.5 pb-1 @[40rem]:flex" aria-label="Heures proches">
      {cards.map((card) => {
        const cardReading = readSlot(field, viewCenter, card.index)
        const d = cardReading.kind === 'ok' ? describeWind(cardReading.reading) : null
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
                'flex min-h-11 w-full min-w-0 items-center justify-center gap-1.5 rounded-md border px-1 py-1 text-[11px] tabular-nums',
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
  )

  const details = showDetails && (
    <div
      data-testid="wind-details"
      className="border-surface-700 text-ink-300 space-y-1 border-t pt-2 text-xs"
    >
      <p>
        <span className="text-ink-100">Source :</span> Open-Meteo (modèle météo), une
        valeur par heure sur {days.length > 1 ? `${days.length} jours` : 'la période'}{' '}
        calendaires, heure locale.
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
          <span className="text-ink-100">Point utilisé :</span> l’échantillon de la grille
          5 × 5 le plus proche du centre de la carte, à{' '}
          {formatKm(haversineMeters(viewCenter, reading.sampleCoordinate))} (aucune
          interpolation).
        </p>
      )}
      <p>
        <span className="text-ink-100">Rendu indicatif :</span> les traits suivent la
        direction et la vitesse de cet échantillon, avec une vitesse exagérée pour rester
        lisible. Ils ne montrent ni le vent local entre les arbres ni l’effet du relief.
      </p>
      <p>
        <span className="text-ink-100">Texte et traits :</span> le texte dit d’où vient le
        vent ; les traits et la flèche vont vers où il souffle. Les points cardinaux sont
        géographiques, même si la carte est tournée.
      </p>
      <p>
        <span className="text-ink-100">Heure et animation :</span> figer ou animer les
        traits ne change pas l’heure ; seule la barre choisit l’heure de prévision.
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
  )

  return (
    <section
      ref={setRootEl}
      aria-label="Analyse du vent"
      data-testid="wind-analysis"
      data-state="expanded"
      className={rootClass}
    >
      {!compact && handle}
      {compact ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-2">
          <div className="flex items-center gap-1">
            {collapseButton}
            {dayChips}
            {nowButton}
            {detailsButton}
            {freezeButton}
            {closeButton}
          </div>
          {notices}
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">{readout}</div>
          </div>
          {timeBar}
          {details}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-3">
          <div className="flex items-center gap-1">
            {collapseButton}
            <span className="flex-1" />
            {nowButton}
            {closeButton}
          </div>
          {dayChips}
          {notices}
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1">{readout}</div>
            {ready && (
              <>
                {detailsButton}
                {freezeButton}
              </>
            )}
          </div>
          {timeBar}
          {hourCards}
          {details}
        </div>
      )}
    </section>
  )
}
