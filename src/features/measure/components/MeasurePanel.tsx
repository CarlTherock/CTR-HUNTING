import { useEffect, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, Pentagon, Play, Ruler, Undo2, X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { formatLatitude, formatLongitude } from '@/utils/coordinateFormat'
import {
  formatAcresFr,
  formatHectaresFr,
  formatKilometersFr,
  formatMetersFr,
  formatSquareMetersFr,
} from '@/utils/format'
import type { Coordinate } from '@/types'
import {
  ELEVATION_UNAVAILABLE,
  SELF_INTERSECTION_WARNING,
  summarizeArea,
  summarizeDistance,
  type AreaSummary,
  type DistanceSummary,
} from '../measureSummary'
import { MIN_POINTS, useMeasureStore, type MeasureKind } from '../state/measureStore'

export const EPHEMERAL_NOTE = 'Cette mesure est éphémère : elle n’est pas enregistrée.'
export const METHOD_NOTE =
  'Calcul géodésique sur une sphère de 6 371 km de rayon ; l’écart avec l’ellipsoïde WGS 84 reste de l’ordre de quelques dixièmes de pour cent.'

/** Short landscape screens (phone turned sideways): fold the results. */
const SHORT_LANDSCAPE = '(orientation: landscape) and (max-height: 480px)'

const BUTTON =
  'border-surface-600 text-ink-100 hover:bg-surface-800 disabled:text-ink-700 flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium disabled:cursor-not-allowed disabled:hover:bg-transparent'
const ICON_BUTTON =
  'text-ink-300 hover:bg-surface-800 hover:text-ink-100 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg'

const TITLES: Record<MeasureKind, string> = {
  distance: 'Mesure de distance',
  area: 'Mesure de surface',
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-1">
      <dt className="text-ink-300 text-xs">{label}</dt>
      <dd className="text-ink-100 text-sm font-medium tabular-nums">{children}</dd>
    </div>
  )
}

function DistanceResults({ summary }: { summary: DistanceSummary }) {
  if (summary.pathMeters === null || summary.birdFlightMeters === null) {
    return (
      <p className="text-ink-300 text-sm">
        Touchez la carte pour ajouter au moins 2 points.
      </p>
    )
  }
  const withKm = (meters: number) =>
    meters >= 1000
      ? `${formatMetersFr(meters)} (${formatKilometersFr(meters)})`
      : formatMetersFr(meters)
  return (
    <dl>
      <Row label="Longueur du tracé (somme des segments)">
        {withKm(summary.pathMeters)}
      </Row>
      <Row label="Distance à vol d’oiseau (premier → dernier point)">
        {withKm(summary.birdFlightMeters)}
      </Row>
      <Row label="Distance 3D (altitude aux points tapés)">
        {summary.length3DMeters === null ? (
          <span className="text-ink-300 font-normal">{ELEVATION_UNAVAILABLE}</span>
        ) : (
          withKm(summary.length3DMeters)
        )}
      </Row>
    </dl>
  )
}

function AreaResults({ summary }: { summary: AreaSummary }) {
  if (summary.areaSquareMeters === null || summary.perimeterMeters === null) {
    return (
      <p className="text-ink-300 text-sm">
        Touchez la carte pour ajouter au moins 3 points.
      </p>
    )
  }
  return (
    <>
      {summary.selfIntersecting && (
        <p
          role="alert"
          className="border-status-warning/50 text-ink-100 mb-1 rounded-md border px-2 py-1.5 text-xs"
        >
          {SELF_INTERSECTION_WARNING}
        </p>
      )}
      <dl>
        <Row label="Surface">
          <span className="flex flex-wrap gap-x-3">
            <span>{formatHectaresFr(summary.areaSquareMeters)}</span>
            <span>{formatSquareMetersFr(summary.areaSquareMeters)}</span>
            <span>{formatAcresFr(summary.areaSquareMeters)}</span>
          </span>
        </Row>
        <Row label="Périmètre">
          {summary.perimeterMeters >= 1000
            ? `${formatMetersFr(summary.perimeterMeters)} (${formatKilometersFr(summary.perimeterMeters)})`
            : formatMetersFr(summary.perimeterMeters)}
        </Row>
      </dl>
    </>
  )
}

function headline(
  kind: MeasureKind,
  distance: DistanceSummary | null,
  area: AreaSummary | null,
): string | null {
  if (kind === 'distance' && distance?.pathMeters != null) {
    return formatMetersFr(distance.pathMeters)
  }
  if (kind === 'area' && area?.areaSquareMeters != null) {
    return formatHectaresFr(area.areaSquareMeters)
  }
  return null
}

export interface MeasurePanelProps {
  /** Real elevation from the loaded terrain, `null` when not available. */
  queryElevation: (coordinate: Coordinate) => number | null
}

/**
 * Compact, collapsible, scrollable measure panel. Lives in the map's bottom
 * dock (which leaves the tool rail uncovered). Everything shown is derived
 * from the in-memory store: no persistence.
 */
export function MeasurePanel({ queryElevation }: MeasurePanelProps) {
  const kind = useMeasureStore((state) => state.kind)
  const active = useMeasureStore((state) => state.active)
  const finished = useMeasureStore((state) => state.finished)
  const points = useMeasureStore((state) => state.points)
  const collapsed = useMeasureStore((state) => state.collapsed)
  const setCollapsed = useMeasureStore((state) => state.setCollapsed)
  const start = useMeasureStore((state) => state.start)
  const removeLastPoint = useMeasureStore((state) => state.removeLastPoint)
  const finish = useMeasureStore((state) => state.finish)
  const clear = useMeasureStore((state) => state.clear)
  const close = useMeasureStore((state) => state.close)
  const isOpen = kind !== null

  // Fold the results on a short landscape screen (when the tool opens, and on
  // rotation); the user can still expand them and the body scrolls.
  useEffect(() => {
    if (!isOpen || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(SHORT_LANDSCAPE)
    const fold = () => {
      if (query.matches) useMeasureStore.getState().setCollapsed(true)
    }
    fold()
    query.addEventListener('change', fold)
    return () => query.removeEventListener('change', fold)
  }, [isOpen])

  if (!kind) return null

  // Elevations are read on each render: a DEM tile that finishes loading
  // makes the 3D figure appear on the next update, never before.
  const distance = kind === 'distance' ? summarizeDistance(points, queryElevation) : null
  const area = kind === 'area' ? summarizeArea(points) : null
  const quick = headline(kind, distance, area)
  const minPoints = MIN_POINTS[kind]
  const status = finished ? 'Terminée' : active ? 'Mode actif' : 'En pause'
  const Icon = kind === 'distance' ? Ruler : Pentagon

  return (
    <section
      role="region"
      aria-label={TITLES[kind]}
      data-testid="measure-panel"
      className="border-surface-600 bg-surface-900/95 pointer-events-auto flex max-h-full min-h-0 w-full flex-col rounded-lg border shadow-xl"
    >
      <div className="flex shrink-0 items-center gap-1 pl-3">
        <Icon size={16} aria-hidden="true" className="text-brand-400 shrink-0" />
        <div className="min-w-0 flex-1 py-1">
          <h2 className="text-ink-100 truncate text-sm font-semibold">
            {TITLES[kind]}
            {quick && collapsed ? ` · ${quick}` : ''}
          </h2>
          <p
            data-testid="measure-status"
            className={cn('text-xs', active ? 'text-brand-400' : 'text-ink-300')}
          >
            {status} · {points.length} point{points.length > 1 ? 's' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Agrandir les résultats' : 'Réduire les résultats'}
          className={ICON_BUTTON}
        >
          {collapsed ? (
            <ChevronUp size={18} aria-hidden="true" />
          ) : (
            <ChevronDown size={18} aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onClick={close}
          aria-label="Quitter la mesure"
          className={ICON_BUTTON}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2 px-3 pb-2">
        <button
          type="button"
          onClick={removeLastPoint}
          disabled={finished || points.length === 0}
          aria-label="Annuler le dernier point"
          className={BUTTON}
        >
          <Undo2 size={16} aria-hidden="true" />
          Annuler
        </button>
        {!finished && !active && (
          <button type="button" onClick={() => start(kind)} className={BUTTON}>
            <Play size={16} aria-hidden="true" />
            Reprendre
          </button>
        )}
        <button
          type="button"
          onClick={finish}
          disabled={finished || points.length < minPoints}
          className={BUTTON}
        >
          Terminer
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={points.length === 0 && !finished}
          className={BUTTON}
        >
          Effacer
        </button>
      </div>

      {!collapsed && (
        <div
          data-testid="measure-body"
          className="border-surface-600 min-h-0 flex-1 overflow-y-auto border-t px-3 py-2"
        >
          {!finished && (
            <p className="text-ink-300 mb-1 text-xs" role="status">
              {active
                ? `Touchez la carte pour ajouter un point (${minPoints} minimum).`
                : 'Mesure en pause : un autre outil de la carte est actif. Touchez « Reprendre » pour continuer.'}
            </p>
          )}
          {distance && <DistanceResults summary={distance} />}
          {area && <AreaResults summary={area} />}
          {points.length > 0 && (
            <details className="mt-1">
              <summary className="text-ink-300 flex min-h-11 cursor-pointer items-center text-xs">
                Coordonnées des points ({points.length})
              </summary>
              <ol className="text-ink-300 list-decimal pl-5 text-xs tabular-nums">
                {points.map((point, index) => (
                  <li key={index} data-lat={point.lat} data-lng={point.lng}>
                    {formatLatitude(point.lat)}, {formatLongitude(point.lng)}
                  </li>
                ))}
              </ol>
            </details>
          )}
          <p className="text-ink-300 mt-1 text-xs">{EPHEMERAL_NOTE}</p>
          <p className="text-ink-500 mt-1 text-xs">{METHOD_NOTE}</p>
        </div>
      )}
    </section>
  )
}
