import { useEffect, useMemo } from 'react'
import { ChevronDown, ChevronUp, Compass, X } from 'lucide-react'
import { Badge } from '@/components/ui'
import { useCompassHeading } from '@/features/field-mode/useCompassHeading'
import { useGpsClock } from '@/features/gps/useGpsClock'
import type { GeolocationReading } from '@/features/gps/useGeolocation'
import type { MapInstance } from '@/services/map'
import type { Waypoint } from '@/types'
import { compassSummary } from '../compassSummary'
import { guidanceView } from '../guidanceView'
import { useGuidanceDestination, useGuidanceStore } from '../state/guidanceStore'
import { useUnwrappedAngle } from '../useUnwrappedAngle'
import { GuidanceArrow } from './GuidanceArrow'

export const GUIDANCE_DISCLAIMER =
  'Guidage à vol d’oiseau — pas un itinéraire routier ou un sentier sécurisé.'

const ICON_BUTTON =
  'text-ink-300 hover:bg-surface-800 hover:text-ink-100 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg'

const TONE_TO_VARIANT = {
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  neutral: 'neutral',
} as const

export interface GuidancePanelProps {
  gpsReading: GeolocationReading
  /** The live map instance, to draw the guidance line and the heading cone. */
  getMapInstance: () => MapInstance | null
}

/**
 * "Aller à": compact, collapsible bird's-eye guidance to a saved waypoint.
 * Mounted only while a destination is set, so the compass listeners and the
 * 1 s clock exist only while guiding. It never writes: the destination's
 * coordinates are read from the waypoints store, nothing is saved, and no
 * track is created (recording is a separate, independent feature).
 *
 * It reuses the single GPS watch of the map page (`gpsReading` is a prop):
 * it never opens a second one.
 */
export function GuidancePanel({ gpsReading, getMapInstance }: GuidancePanelProps) {
  const destination = useGuidanceDestination()
  const notice = useGuidanceStore((state) => state.notice)
  const dismissNotice = useGuidanceStore((state) => state.dismissNotice)

  if (destination) {
    return (
      <ActiveGuidance
        waypoint={destination}
        gpsReading={gpsReading}
        getMapInstance={getMapInstance}
      />
    )
  }
  if (!notice) return null
  return (
    <div
      role="status"
      data-testid="guidance-notice"
      className="border-status-warning/50 bg-surface-900/95 text-ink-100 pointer-events-auto flex w-full items-start gap-1 rounded-lg border pl-3 text-sm shadow-xl"
    >
      <p className="min-w-0 flex-1 py-2.5">{notice}</p>
      <button
        type="button"
        onClick={dismissNotice}
        aria-label="Fermer le message"
        className={ICON_BUTTON}
      >
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  )
}

function ActiveGuidance({
  waypoint,
  gpsReading,
  getMapInstance,
}: GuidancePanelProps & { waypoint: Waypoint }) {
  const collapsed = useGuidanceStore((state) => state.collapsed)
  const setCollapsed = useGuidanceStore((state) => state.setCollapsed)
  const stop = useGuidanceStore((state) => state.stop)
  const nowMs = useGpsClock(1000)

  // Declination needs the position; a stale fix is fine for that (it moves
  // by hundredths of a degree per kilometre) — it is NOT used for guidance.
  const position = gpsReading.status === 'available' ? gpsReading.value : null
  const compass = useCompassHeading({ position })

  const view = useMemo(
    () =>
      guidanceView({
        destination: { name: waypoint.name, coordinate: waypoint.coordinate },
        gps: gpsReading,
        nowMs,
        heading: {
          magneticHeading: compass.magneticHeading,
          trueHeading: compass.trueHeading,
          reliable: compass.reliable,
          declinationDegrees: compass.declinationDegrees,
          warning: compass.warning,
          unavailableReason:
            compass.reading.status === 'unavailable' ? compass.reading.reason : null,
        },
      }),
    [
      waypoint.name,
      waypoint.coordinate,
      gpsReading,
      nowMs,
      compass.magneticHeading,
      compass.trueHeading,
      compass.reliable,
      compass.declinationDegrees,
      compass.warning,
      compass.reading,
    ],
  )

  const arrowAngle = useUnwrappedAngle(
    view.arrow.kind === 'relative' ? view.arrow.angleDegrees : null,
  )

  // Map side: the dashed line (only with a usable fix) and the heading cone
  // (only with a reliable TRUE heading). Both are cleared on unmount.
  const line = view.line
  const fromLat = line?.from.lat
  const fromLng = line?.from.lng
  const toLat = line?.to.lat
  const toLng = line?.to.lng
  useEffect(() => {
    const map = getMapInstance()
    if (
      fromLat === undefined ||
      fromLng === undefined ||
      toLat === undefined ||
      toLng === undefined
    ) {
      map?.setGuidanceLine(null)
      return
    }
    map?.setGuidanceLine([
      { lat: fromLat, lng: fromLng },
      { lat: toLat, lng: toLng },
    ])
  }, [getMapInstance, fromLat, fromLng, toLat, toLng])

  const coneHeading =
    compass.reliable && compass.trueHeading !== null ? compass.trueHeading : null
  useEffect(() => {
    getMapInstance()?.setUserHeading(coneHeading)
  }, [getMapInstance, coneHeading])

  useEffect(
    () => () => {
      const map = getMapInstance()
      map?.setGuidanceLine(null)
      map?.setUserHeading(null)
    },
    [getMapInstance],
  )

  const compassInfo = compassSummary(compass)
  const gpsBadge = (
    <Badge variant={TONE_TO_VARIANT[view.gps.tone]} data-testid="guidance-gps-state">
      GPS : {view.gps.label}
    </Badge>
  )

  return (
    <section
      aria-label="Guidage"
      data-testid="guidance-panel"
      className="border-surface-600 bg-surface-900/95 pointer-events-auto flex max-h-full min-h-0 w-full flex-col overflow-hidden rounded-lg border shadow-xl backdrop-blur-sm"
    >
      <header className="flex shrink-0 items-center gap-1 pl-3">
        <h2
          data-testid="guidance-title"
          className="text-ink-100 line-clamp-2 min-w-0 flex-1 py-2 text-sm leading-tight font-semibold break-words"
        >
          Aller à : {waypoint.name}
        </h2>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Agrandir' : 'Réduire'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Agrandir le guidage' : 'Réduire le guidage'}
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
          onClick={stop}
          aria-label="Arrêter le guidage"
          title="Arrêter le guidage"
          className={ICON_BUTTON}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      {collapsed ? (
        <p
          data-testid="guidance-summary"
          className="text-ink-300 px-3 pb-2 text-xs tabular-nums"
        >
          {view.distanceText
            ? `${view.distanceText}${view.bearingText ? ` · ${view.bearingText}` : ''}${view.notFresh ? ' · non fraîches' : ''} · à vol d’oiseau`
            : (view.proximityMessage ?? view.unavailableReason)}
        </p>
      ) : (
        <div
          data-testid="guidance-body"
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3"
        >
          {view.distanceText === null ? (
            <p
              role="status"
              data-testid="guidance-unavailable"
              className="text-ink-100 text-sm"
            >
              {view.unavailableReason} Aucune distance ni direction n’est affichée sans
              position GPS fiable.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1 basis-32">
                <p
                  data-testid="guidance-distance"
                  className="text-ink-100 text-3xl leading-none font-bold tabular-nums"
                >
                  {view.distanceText}
                </p>
                {view.bearingText && (
                  <p
                    data-testid="guidance-bearing"
                    className="text-ink-100 mt-1 text-base font-medium tabular-nums"
                  >
                    {view.bearingText}
                  </p>
                )}
              </div>
              {view.arrow.kind === 'relative' && arrowAngle !== null && (
                <GuidanceArrow
                  angleDegrees={arrowAngle}
                  description={view.arrow.description}
                  dimmed={view.notFresh}
                />
              )}
            </div>
          )}

          {view.arrow.kind === 'relative' && (
            <p data-testid="guidance-relative" className="text-ink-100 text-sm">
              {view.arrow.description}
            </p>
          )}
          <div className="flex flex-col gap-2" data-testid="guidance-compass">
            {compass.needsPermission && (
              <button
                type="button"
                onClick={() => void compass.requestPermission()}
                className="border-surface-600 bg-surface-800 text-ink-100 hover:bg-surface-700 flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium"
              >
                <Compass size={16} aria-hidden="true" />
                Activer la boussole
              </button>
            )}
            <p
              data-testid="guidance-compass-text"
              className={
                compassInfo.problem
                  ? 'text-status-warning text-xs'
                  : 'text-ink-300 text-xs'
              }
            >
              {compassInfo.text}
            </p>
          </div>

          {view.arrow.kind === 'none' && view.arrow.reason && (
            <p data-testid="guidance-arrow-reason" className="text-ink-300 text-xs">
              {view.arrow.reason}
            </p>
          )}
          {view.proximityMessage && (
            <p
              role="status"
              data-testid="guidance-proximity"
              className="text-ink-100 text-sm"
            >
              {view.proximityMessage}
            </p>
          )}
          {view.notFreshNotice && (
            <p
              role="status"
              data-testid="guidance-not-fresh"
              className="text-status-warning text-xs"
            >
              {view.notFreshNotice}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2" data-testid="guidance-gps">
            {gpsBadge}
            {view.gps.accuracyText && (
              <span className="text-ink-300 text-xs">
                {view.gps.accuracyText} · {view.gps.ageText}
              </span>
            )}
          </div>

          {view.travelDirectionText && (
            <p data-testid="guidance-travel" className="text-ink-300 text-xs">
              {view.travelDirectionText}
            </p>
          )}

          <p data-testid="guidance-disclaimer" className="text-ink-500 text-xs">
            {GUIDANCE_DISCLAIMER}
          </p>
        </div>
      )}
    </section>
  )
}
