import { Card } from '@/components/ui'
import type { DayAnalysis, HourSlot } from '../engine'
import { PRESSURE_TYPE } from '../engine/pressure'

function path(
  slots: readonly HourSlot[],
  pick: (s: HourSlot) => number | null,
  min: number,
  max: number,
) {
  const span = max - min || 1
  const out: string[] = []
  let cur = ''
  slots.forEach((s, i) => {
    const v = pick(s)
    if (v === null) {
      if (cur) out.push(cur)
      cur = ''
      return
    }
    cur += `${cur ? 'L' : 'M'}${(i + 0.5).toFixed(2)} ${(100 - ((v - min) / span) * 100).toFixed(2)} `
  })
  if (cur) out.push(cur)
  return out
}

function range(values: (number | null)[]): [number, number] | null {
  const v = values.filter((x): x is number => x !== null)
  return v.length ? [Math.min(...v), Math.max(...v)] : null
}

function Mini({
  title,
  unit,
  slots,
  pick,
  color,
}: {
  title: string
  unit: string
  slots: readonly HourSlot[]
  pick: (s: HourSlot) => number | null
  color: string
}) {
  const r = range(slots.map(pick))
  return (
    <div>
      <p className="text-ink-300 text-xs">
        {title}{' '}
        {r
          ? `: ${r[0].toFixed(r[1] > 100 ? 0 : 1)} à ${r[1].toFixed(r[1] > 100 ? 0 : 1)} ${unit}`
          : ': indisponible'}
      </p>
      {r && (
        <svg
          viewBox="0 0 24 100"
          preserveAspectRatio="none"
          role="img"
          aria-label={`${title}, courbe horaire de la journée`}
          className="border-surface-700 bg-surface-950 h-14 w-full rounded border"
        >
          {path(slots, pick, r[0], r[1]).map((d) => (
            <path
              key={d}
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      )}
    </div>
  )
}

/** Pression : donnée, tendance calculée et effet biologique (non calibré) présentés séparément. */
export function PressurePanel({ day }: { day: DayAnalysis }) {
  const slots = day.slots
  const available = slots.some((s) => s.weather?.surfacePressureHpa != null)
  const top = day.windows[0]
  const atTop = top ? slots.find((s) => s.startIso === top.startIso)?.pressure4h : null
  return (
    <Card className="p-3">
      <h2 className="text-ink-100 text-sm font-semibold">
        Pression atmosphérique (contexte)
      </h2>
      <p className="text-ink-500 mt-1 text-xs">
        Contexte météo — effet sur les déplacements non calibré pour ce lieu. La pression
        et sa variation n’entrent pas dans l’indice.
      </p>
      <dl className="text-ink-300 mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="font-medium">Donnée météo</dt>
        <dd>
          {available
            ? `Disponible — pression de ${PRESSURE_TYPE === 'surface' ? 'surface (station), pas ramenée au niveau de la mer' : 'niveau de la mer'}, en hPa.`
            : 'Indisponible pour ce jour (aucune prévision, ou horizon dépassé).'}
        </dd>
        <dt className="font-medium">Tendance calculée</dt>
        <dd>
          {atTop && atTop.state === 'ok'
            ? `${atTop.deltaHpa && atTop.deltaHpa > 0 ? '+' : ''}${atTop.deltaHpa} hPa sur ${atTop.elapsedHours} h écoulées avant le début du créneau (${atTop.slopeHpaPerHour} hPa/h) — ${
                atTop.nature === 'passee'
                  ? 'tendance passée'
                  : atTop.nature === 'prevue'
                    ? 'variation prévue'
                    : 'mi-passée, mi-prévue'
              }. Calcul technique, pas une reproduction d’une étude.`
            : atTop
              ? `Indisponible : ${atTop.reason}`
              : 'Aucun créneau ou aucune donnée : non calculée.'}
        </dd>
        <dt className="font-medium">Effet biologique</dt>
        <dd>Non calibré — règle inactive, aucune contribution à l’indice.</dd>
      </dl>
      {available && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Mini
            title="Pression de surface"
            unit="hPa"
            slots={slots}
            pick={(s) => s.weather?.surfacePressureHpa ?? null}
            color="#38bdf8"
          />
          <Mini
            title="Température"
            unit="°C"
            slots={slots}
            pick={(s) => s.weather?.temperatureC ?? null}
            color="#fb923c"
          />
          <Mini
            title="Vent"
            unit="km/h"
            slots={slots}
            pick={(s) => s.weather?.windSpeedKmh ?? null}
            color="#a3e635"
          />
          <Mini
            title="Pluie"
            unit="mm/h"
            slots={slots}
            pick={(s) => s.weather?.precipitationMm ?? null}
            color="#818cf8"
          />
        </div>
      )}
      <p className="text-ink-600 mt-2 text-[11px]">
        Sources : Mississippi DWFP (synthèse : pas de pression idéale fiable ; variables
        corrélées), Penn State (tempêtes : pas d’augmentation cohérente de déplacement),
        Goethlich (chapitre 2 incomplet : aucun coefficient). Valeurs de la prévision
        Open-Meteo ; hors ligne, celles de l’analyse enregistrée.
      </p>
    </Card>
  )
}
