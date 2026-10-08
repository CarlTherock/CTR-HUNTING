import { useHeatmapStore } from '../state/heatmapStore'

/**
 * Sélecteur d'heure de l'analyse. Il ne propose QUE les heures réellement
 * présentes dans le vent ou la météo déjà chargés (plus l'heure en cours) :
 * aucune extrapolation, et en changer ne fait aucune requête — les
 * cellules sont simplement recalculées à partir des données en mémoire.
 */
export function HourSelect({ id }: { id: string }) {
  const hourOptions = useHeatmapStore((s) => s.hourOptions)
  const hour = useHeatmapStore((s) => s.hour)
  const setSelectedHour = useHeatmapStore((s) => s.setSelectedHour)
  if (hourOptions.length === 0) return null

  const windLoaded = hourOptions.some((o) => o.hasWind)
  const weatherLoaded = hourOptions.some((o) => o.hasWeather)

  return (
    <label htmlFor={id} className="flex flex-col gap-1">
      <span className="text-ink-500 text-xs font-medium">Heure analysée</span>
      <select
        id={id}
        value={hour?.hourKey ?? ''}
        onChange={(e) => {
          const option = hourOptions.find((o) => o.hourKey === e.target.value)
          // « Actuel » suit l'horloge (null), plutôt que de figer une heure.
          setSelectedHour(!option || option.kind === 'current' ? null : option.hourKey)
        }}
        className="border-surface-600 bg-surface-800 text-ink-100 focus-visible:outline-brand-400 w-full rounded-md border px-2 py-1.5 text-sm outline-none focus-visible:outline-2 pointer-coarse:min-h-11"
      >
        {hourOptions.map((o) => (
          <option key={o.hourKey} value={o.hourKey}>
            {o.label}
            {windLoaded && !o.hasWind ? ' (sans vent)' : ''}
            {weatherLoaded && !o.hasWeather ? ' (sans météo)' : ''}
          </option>
        ))}
      </select>
    </label>
  )
}
