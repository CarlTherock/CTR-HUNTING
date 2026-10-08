import { TRIP_COLOR_OPTIONS } from '../trackStyle'

interface TripColorPickerProps {
  value: string
  onChange: (color: string) => void
  label: string
}

/** Palette of trip colours (red is deliberately absent: it is reserved for
 * blood searches). Colour is never the only cue: each swatch has a name. */
export function TripColorPicker({ value, onChange, label }: TripColorPickerProps) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {TRIP_COLOR_OPTIONS.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            title={option.label}
            onClick={() => onChange(option.value)}
            className={`flex h-11 w-11 items-center justify-center rounded-full border-2 ${
              selected ? 'border-ink-100' : 'border-surface-600'
            }`}
          >
            <span
              className="block h-6 w-6 rounded-full border border-white/70"
              style={{ background: option.value }}
              aria-hidden="true"
            />
            {selected && <span className="sr-only">(choisie)</span>}
          </button>
        )
      })}
    </div>
  )
}
