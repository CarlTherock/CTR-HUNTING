import { cn } from '@/utils/cn'
import {
  WIND_DENSITY_LABEL,
  WIND_SIZE_LABEL,
  WIND_THICKNESS_LABEL,
  type WindDensity,
  type WindSize,
  type WindStyle,
  type WindThickness,
} from '@/utils/windStyle'

function Segmented<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string
  hint?: string
  value: T
  options: Record<T, string>
  onChange: (value: T) => void
}) {
  return (
    <div>
      <p className="text-ink-300 mb-1 text-xs font-medium">
        {label}
        {hint && <span className="text-ink-500 font-normal"> · {hint}</span>}
      </p>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-1">
        {(Object.keys(options) as T[]).map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={key === value}
            onClick={() => onChange(key)}
            className={cn(
              'rounded-md border px-2 py-1.5 text-xs font-medium pointer-coarse:min-h-11',
              key === value
                ? 'border-brand-400 bg-brand-500/20 text-brand-300'
                : 'border-surface-600 text-ink-300 hover:bg-surface-800',
            )}
          >
            {options[key]}
          </button>
        ))}
      </div>
    </div>
  )
}

/** « Réglages » of the wind particles: purely visual, applied at once, saved
 * on the device. Size is the length of the trail — never the wind speed. */
export function WindStyleSettings({
  style,
  onChange,
}: {
  style: WindStyle
  onChange: (patch: Partial<WindStyle>) => void
}) {
  return (
    <div className="flex flex-col gap-3" data-testid="wind-style-settings">
      <Segmented<WindSize>
        label="Taille du vent"
        hint="longueur des traînées"
        value={style.size}
        options={WIND_SIZE_LABEL}
        onChange={(size) => onChange({ size })}
      />
      <Segmented<WindThickness>
        label="Épaisseur"
        value={style.thickness}
        options={WIND_THICKNESS_LABEL}
        onChange={(thickness) => onChange({ thickness })}
      />
      <Segmented<WindDensity>
        label="Densité"
        hint="nombre de particules"
        value={style.density}
        options={WIND_DENSITY_LABEL}
        onChange={(density) => onChange({ density })}
      />
      <label className="border-surface-600 flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs pointer-coarse:min-h-11">
        <span>
          <span className="text-ink-100 block font-medium">Contraste renforcé</span>
          <span className="text-ink-500 block">
            Halo sombre, utile sur satellite ou sur une couche colorée
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={style.contrast}
          onChange={(e) => onChange({ contrast: e.target.checked })}
          className="accent-brand-500 size-5 shrink-0"
        />
      </label>
      <p className="text-ink-500 text-[11px]">
        Réglages d’affichage seulement : la vitesse et la direction du vent ne changent
        pas. Enregistrés sur cet appareil.
      </p>
    </div>
  )
}
