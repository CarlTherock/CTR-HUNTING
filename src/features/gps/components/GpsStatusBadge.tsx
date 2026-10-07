import { Badge } from '@/components/ui'
import { gpsStatusView } from '../gpsStatus'
import { useGpsClock } from '../useGpsClock'
import type { GeolocationReading } from '../useGeolocation'

/** Compact GPS badge of the map. Owns its own clock so only this badge
 * re-renders every few seconds, not the whole map page. */
export function GpsStatusBadge({ reading }: { reading: GeolocationReading }) {
  const view = gpsStatusView(reading, useGpsClock())

  let text: string
  if (reading.status === 'available') {
    const accuracy =
      typeof reading.value.accuracyMeters === 'number' &&
      Number.isFinite(reading.value.accuracyMeters)
        ? ` ±${Math.round(reading.value.accuracyMeters)} m`
        : ''
    text = view.label === 'Ancien' ? `GPS ancien${accuracy}` : `GPS${accuracy}`
  } else if (view.label === 'Recherche…') {
    text = 'GPS : recherche…'
  } else if (view.label === 'Refusé') {
    text = 'GPS refusé'
  } else {
    text = 'GPS indisponible'
  }

  return (
    <Badge
      variant={
        view.tone === 'success'
          ? 'success'
          : view.tone === 'neutral'
            ? 'neutral'
            : 'warning'
      }
      title={view.reason ?? [view.accuracyText, view.ageText].filter(Boolean).join(' · ')}
    >
      {text}
    </Badge>
  )
}
