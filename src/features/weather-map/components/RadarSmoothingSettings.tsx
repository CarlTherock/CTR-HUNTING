import { cn } from '@/utils/cn'
import {
  RADAR_SMOOTHING_LABEL,
  type RadarSmoothing,
} from '@/services/weather-map/softTemplate'

const HINT: Record<RadarSmoothing, string> = {
  precis: 'cellules brutes de 1 km, telles que fournies',
  doux: 'blocs fondus, zones fidèles',
  'tres-doux': 'dégradés lisses, plus flou',
}

/** « Rendu » of the radar: purely visual, applied at once, saved on the device.
 * Same data and same legend colours at every level. */
export function RadarSmoothingSettings({
  level,
  onChange,
}: {
  level: RadarSmoothing
  onChange: (level: RadarSmoothing) => void
}) {
  return (
    <div className="flex flex-col gap-2" data-testid="radar-smoothing-settings">
      <p className="text-ink-300 text-xs font-medium">
        Rendu du radar
        <span className="text-ink-500 font-normal"> · {HINT[level]}</span>
      </p>
      <div
        role="radiogroup"
        aria-label="Rendu du radar"
        className="grid grid-cols-3 gap-1"
      >
        {(Object.keys(RADAR_SMOOTHING_LABEL) as RadarSmoothing[]).map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={key === level}
            onClick={() => onChange(key)}
            className={cn(
              'rounded-md border px-2 py-1.5 text-xs font-medium pointer-coarse:min-h-11',
              key === level
                ? 'border-brand-400 bg-brand-500/20 text-brand-300'
                : 'border-surface-600 text-ink-300 hover:bg-surface-800',
            )}
          >
            {RADAR_SMOOTHING_LABEL[key]}
          </button>
        ))}
      </div>
      <p className="text-ink-500 text-[11px]">
        Affichage seulement : mêmes données et mêmes couleurs de légende. Enregistré sur
        cet appareil.
      </p>
    </div>
  )
}
