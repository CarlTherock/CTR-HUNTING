import { LocateFixed, LocateOff } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { GeolocationReading } from '../useGeolocation'

export interface GpsControlProps {
  reading: GeolocationReading
  onLocate: () => void
}

/** Floating "recenter on my position" button, opposite corner from
 * `LayerManagerPanel` so the two never overlap. Reflects the current GPS
 * reading directly — no fix means the button is visibly disabled rather
 * than silently doing nothing. */
export function GpsControl({ reading, onLocate }: GpsControlProps) {
  const available = reading.status === 'available'

  return (
    <button
      type="button"
      onClick={onLocate}
      disabled={!available}
      title={available ? 'Center on my position' : reading.reason}
      aria-label="Center on my position"
      className={cn(
        'border-surface-600 bg-surface-900/90 absolute right-3 bottom-3 z-10 rounded-lg border p-2.5 shadow-lg backdrop-blur-sm transition-colors',
        available
          ? 'text-brand-400 hover:bg-surface-800'
          : 'text-ink-700 cursor-not-allowed',
      )}
    >
      {available ? (
        <LocateFixed size={18} aria-hidden="true" />
      ) : (
        <LocateOff size={18} aria-hidden="true" />
      )}
    </button>
  )
}
