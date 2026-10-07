import { LocateFixed, LocateOff } from 'lucide-react'
import { ToolTrigger } from '@/components/map-tools'
import type { GeolocationReading } from '../useGeolocation'

export interface GpsControlProps {
  reading: GeolocationReading
  onLocate: () => void
  /** Field Mode (Phase 11): a larger touch target for one-handed/gloved
   * outdoor use. */
  large?: boolean
}

/** "Recenter on my position" quick action. Reflects the current GPS
 * reading directly — no fix means the button is visibly disabled (with the
 * reason as its tooltip) rather than silently doing nothing. */
export function GpsControl({ reading, onLocate, large }: GpsControlProps) {
  const available = reading.status === 'available'
  const size = large ? 32 : 20

  return (
    <ToolTrigger
      placement="rail"
      label="Me localiser"
      title={available ? 'Centrer la carte sur ma position' : reading.reason}
      icon={
        available ? (
          <LocateFixed size={size} aria-hidden="true" />
        ) : (
          <LocateOff size={size} aria-hidden="true" />
        )
      }
      onClick={onLocate}
      disabled={!available}
      active={available}
      large={large}
      order={10}
    />
  )
}
