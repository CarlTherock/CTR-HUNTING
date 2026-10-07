import { Badge } from '@/components/ui'
import { formatLatitude, formatLongitude } from '@/utils/coordinateFormat'
import { ShareActions } from '@/features/share/components/ShareActions'
import { buildPositionShare, SNAPSHOT_SENTENCE } from '@/features/share/shareContent'
import { gpsStatusView } from '../gpsStatus'
import { useGpsClock } from '../useGpsClock'
import type { GeolocationReading } from '../useGeolocation'

export interface MyPositionBlockProps {
  reading: GeolocationReading
}

const TONE_TO_VARIANT = {
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  neutral: 'neutral',
} as const

/**
 * "Ma position": the live GPS state of the device, kept visually separate
 * from any waypoint. Without a fix it explains why (searching, denied, ...)
 * — it never falls back to the map centre or a default. The share action
 * only exists for a fix that is not stale, and it shares a one-off snapshot.
 */
export function MyPositionBlock({ reading }: MyPositionBlockProps) {
  const nowMs = useGpsClock()
  const view = gpsStatusView(reading, nowMs)

  return (
    <section
      aria-label="Ma position"
      data-testid="my-position"
      className="border-surface-600 flex flex-col gap-2 rounded-md border p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-ink-100 text-sm font-semibold">Ma position</h3>
        <Badge variant={TONE_TO_VARIANT[view.tone]} data-testid="gps-state">
          {view.label}
        </Badge>
      </div>

      {reading.status === 'unavailable' ? (
        <p className="text-ink-300 text-sm" data-testid="gps-reason">
          {view.reason}
        </p>
      ) : (
        <>
          <p className="text-ink-100 text-base font-medium tabular-nums select-text">
            {formatLatitude(reading.value.lat)} · {formatLongitude(reading.value.lng)}
          </p>
          <p className="text-ink-300 text-sm" data-testid="gps-accuracy-age">
            {view.accuracyText} · {view.ageText}
          </p>
          {view.warning && (
            <p className="text-status-warning text-xs" data-testid="gps-warning">
              {view.warning}
            </p>
          )}
          {view.shareable && (
            <div className="flex flex-col gap-2">
              <p className="text-ink-300 text-xs" data-testid="snapshot-explanation">
                {SNAPSHOT_SENTENCE} Rien n’est envoyé automatiquement : vous choisissez le
                destinataire.
              </p>
              <ShareActions
                testId="position"
                shareLabel="Partager ma position"
                payload={buildPositionShare({
                  coordinate: { lat: reading.value.lat, lng: reading.value.lng },
                  accuracyMeters: reading.value.accuracyMeters,
                  timestampMs: reading.value.timestampMs,
                })}
              />
            </div>
          )}
        </>
      )}
    </section>
  )
}
