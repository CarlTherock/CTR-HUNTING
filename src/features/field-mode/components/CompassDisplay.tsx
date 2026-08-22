import { Compass } from 'lucide-react'
import { compassLabel } from '@/utils/terrain'
import { useCompassHeading } from '../useCompassHeading'

/** Large, high-contrast real compass heading for Field Mode — tapping
 * "Enable compass" triggers the required iOS permission gesture; other
 * platforms start automatically. Never shows a heading it doesn't
 * genuinely have (unavailable states always give the real reason). */
export function CompassDisplay() {
  const { reading, needsPermission, requestPermission } = useCompassHeading()

  if (needsPermission) {
    return (
      <button
        type="button"
        onClick={() => void requestPermission()}
        className="border-surface-600 bg-surface-800 text-ink-100 flex flex-col items-center gap-2 rounded-lg border p-6"
      >
        <Compass size={32} className="text-brand-400" aria-hidden="true" />
        <span className="text-sm font-medium">Enable compass</span>
      </button>
    )
  }

  if (reading.status === 'unavailable') {
    return (
      <div className="border-surface-600 bg-surface-800 text-ink-500 flex flex-col items-center gap-2 rounded-lg border p-6 text-center text-sm">
        <Compass size={32} aria-hidden="true" />
        {reading.reason}
      </div>
    )
  }

  return (
    <div className="border-surface-600 bg-surface-800 flex flex-col items-center gap-2 rounded-lg border p-6">
      <div className="relative flex h-24 w-24 items-center justify-center">
        <Compass
          size={96}
          className="text-brand-400 absolute"
          style={{ transform: `rotate(${-reading.value}deg)` }}
          aria-hidden="true"
        />
      </div>
      <p className="text-ink-100 text-2xl font-bold">{Math.round(reading.value)}°</p>
      <p className="text-ink-500 text-sm">{compassLabel(reading.value)}</p>
    </div>
  )
}
