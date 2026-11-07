import { Card } from '@/components/ui'
import type { DayAnalysis } from '../engine'

const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]
const fmt = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`

/** Température : valeur, évolution calculée et rôle réel (contexte seulement) séparés. */
export function TemperaturePanel({ day }: { day: DayAnalysis }) {
  const temps = day.slots.flatMap((s) =>
    (s.weather?.temperatureC ?? null) === null ? [] : [s.weather?.temperatureC as number],
  )
  const top = day.windows[0]
  const slot = top ? day.slots.find((s) => s.startIso === top.startIso) : undefined
  const w = slot?.weather ?? null
  const month = MONTHS[Number(day.dateKey.slice(5, 7)) - 1] ?? ''
  return (
    <Card className="p-3">
      <h2 className="text-ink-100 text-sm font-semibold">Température (contexte)</h2>
      <p className="text-ink-500 mt-1 text-xs">
        Ne modifie pas l’indice : aucune pondération biologique suffisamment étayée.
      </p>
      <dl className="text-ink-300 mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="font-medium">Affichée</dt>
        <dd>
          {temps.length
            ? `${Math.min(...temps).toFixed(1)} à ${Math.max(...temps).toFixed(1)} °C sur la journée (prévision, ${month}).${w?.temperatureC != null ? ` Au créneau n° 1 (${slot?.clock}) : ${w.temperatureC.toFixed(1)} °C.` : ''}`
            : 'Indisponible (aucune prévision pour ce jour).'}
        </dd>
        <dt className="font-medium">Évolution calculée</dt>
        <dd>
          {w?.temperatureChangeSinceYesterdayC != null
            ? `${fmt(w.temperatureChangeSinceYesterdayC)} °C par rapport à la veille à la même heure.`
            : 'Indisponible (la veille à la même heure n’est pas dans les données). Aucune anomalie aux normales : pas de climatologie réelle dans l’application.'}
        </dd>
        <dt className="font-medium">Au même créneau</dt>
        <dd>
          {w
            ? `vent ${w.windSpeedKmh ?? '—'} km/h, pluie ${w.precipitationMm ?? '—'} mm, neige tombée ${w.snowfallCm ?? '—'} cm, couverture nuageuse ${w.cloudCoverPercent ?? '—'} % — lus ensemble, jamais combinés en bonus.`
            : 'Indisponible.'}
        </dd>
        <dt className="font-medium">Rôle réel</dt>
        <dd>
          Explication seulement. Pas de règle « plus froid = meilleur » ; une baisse de
          température n’ajoute rien au score (aucun double compte avec un épisode de
          pression ou de front).
        </dd>
      </dl>
    </Card>
  )
}
