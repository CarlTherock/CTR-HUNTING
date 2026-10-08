import { Crosshair, Map as MapIcon, X } from 'lucide-react'
import type { Coordinate } from '@/types'
import { cn } from '@/utils/cn'

export type PositionChoice = 'gps' | 'map-center' | null

const CHIP =
  'flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium disabled:opacity-50'

/** Choose where a point comes from: the phone's GPS, the centre of the map
 * (a point chosen by hand), or nothing (optional points). The value shown is
 * exactly what will be saved; no position is guessed. */
export function PositionPicker({
  label,
  choice,
  onChoice,
  gpsFix,
  position,
  optional,
}: {
  label: string
  choice: PositionChoice
  onChoice: (choice: PositionChoice) => void
  gpsFix: boolean
  position: Coordinate | null
  /** Optional points can be cleared. */
  optional?: boolean
}) {
  const option = (value: Exclude<PositionChoice, null>) =>
    cn(
      CHIP,
      choice === value
        ? 'border-brand-400 bg-brand-500/20 text-brand-400'
        : 'border-surface-600 bg-surface-800 text-ink-100',
    )
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          role="radio"
          aria-checked={choice === 'gps'}
          disabled={!gpsFix}
          onClick={() => onChoice('gps')}
          className={option('gps')}
        >
          <Crosshair size={16} aria-hidden="true" /> Ma position GPS
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={choice === 'map-center'}
          onClick={() => onChoice('map-center')}
          className={option('map-center')}
        >
          <MapIcon size={16} aria-hidden="true" /> Centre de la carte (manuel)
        </button>
        {optional && choice !== null && (
          <button
            type="button"
            onClick={() => onChoice(null)}
            className={cn(CHIP, 'border-surface-600 text-ink-300 border')}
          >
            <X size={16} aria-hidden="true" /> Aucune
          </button>
        )}
      </div>
      <p role="status" className="text-ink-300 text-xs">
        {position
          ? `${choice === 'gps' ? `GPS${position.accuracyMeters !== undefined ? ` ±${Math.round(position.accuracyMeters)} m` : ''}` : 'Position manuelle (précision inconnue)'} · ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`
          : optional
            ? 'Non renseignée.'
            : gpsFix
              ? 'Choisissez une position.'
              : 'GPS indisponible : choisissez « Centre de la carte » (position manuelle) ou attendez le GPS.'}
      </p>
    </div>
  )
}
