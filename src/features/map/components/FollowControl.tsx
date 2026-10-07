import { LocateFixed, Navigation } from 'lucide-react'
import { ToolTrigger } from '@/components/map-tools'
import type { GeolocationReading } from '@/features/gps/useGeolocation'
import { useFollowStore } from '../state/followStore'

export interface FollowControlProps {
  gpsReading: GeolocationReading
  /** Recentres once at a useful zoom when following starts. */
  onStart: () => void
  large?: boolean
}

/** Rail button "Suivre ma position" (a toggle). */
export function FollowControl({ gpsReading, onStart, large }: FollowControlProps) {
  const mode = useFollowStore((state) => state.mode)
  const toggle = useFollowStore((state) => state.toggle)
  const available = gpsReading.status === 'available'
  const following = mode === 'following'
  const title = following
    ? 'Le suivi de ma position est actif — touchez pour l’arrêter'
    : mode === 'paused'
      ? 'Suivi en pause — touchez pour le reprendre'
      : available
        ? 'La carte suit ma position'
        : `Suivi indisponible : ${gpsReading.reason}`
  return (
    <ToolTrigger
      placement="rail"
      label="Suivre ma position"
      title={title}
      icon={<Navigation size={large ? 32 : 20} aria-hidden="true" />}
      onClick={() => {
        if (mode !== 'following' && available) onStart()
        toggle()
      }}
      pressed={following}
      active={following}
      disabled={mode === 'off' && !available}
      large={large}
      order={11}
    />
  )
}

/** Shown only while the follow is paused by a manual gesture. */
export function ResumeFollowButton() {
  const mode = useFollowStore((state) => state.mode)
  const resume = useFollowStore((state) => state.resume)
  if (mode !== 'paused') return null
  return (
    <button
      type="button"
      onClick={resume}
      data-testid="resume-follow"
      className="border-brand-500/50 bg-surface-900/95 text-ink-100 hover:bg-surface-800 pointer-events-auto flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium shadow-lg"
    >
      <LocateFixed size={16} aria-hidden="true" />
      Reprendre le suivi
    </button>
  )
}
