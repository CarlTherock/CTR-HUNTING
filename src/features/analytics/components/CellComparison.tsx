import { useMemo } from 'react'
import { diffAnalyses, compareSlots } from '../cellDiff'
import { ANALYZER_LABEL, FAMILY_LABEL } from '@/utils/analysisFamilies'
import { dataTimeZone, resolveHour } from '@/utils/analysisTime'
import { formatContribution } from './analyzerFormat'
import type { CellStatic } from '../heatmapEngine'
import type { AnalysisDifference } from '../cellDiff'
import type { HourOption } from '@/utils/analysisTime'
import type { CombinedAnalysis, WeatherForecast, WindField } from '@/types'

function formatDelta(delta: number | null): string {
  if (delta === null) return '—'
  const rounded = Math.round(delta)
  return rounded > 0 ? `+${rounded}` : rounded < 0 ? `−${Math.abs(rounded)}` : '0'
}

function score(value: number | null): string {
  return value === null ? 'aucun indice' : `${Math.round(value)}/100`
}

function DifferenceList({
  difference,
  leftLabel,
  rightLabel,
}: {
  difference: AnalysisDifference
  leftLabel: string
  rightLabel: string
}) {
  const shown = difference.differing.slice(0, 6)
  return (
    <div className="flex flex-col gap-1.5 text-xs">
      <p className="text-ink-200">
        Indice : {leftLabel} {score(difference.overall.a)} · {rightLabel}{' '}
        {score(difference.overall.b)}
        {difference.overall.delta !== null && (
          <span className="text-ink-300">
            {' '}
            (écart {formatDelta(difference.overall.delta)})
          </span>
        )}
      </p>
      <ul className="text-ink-300 flex flex-col gap-0.5">
        {difference.families
          .filter((f) => f.a !== null || f.b !== null)
          .map((f) => (
            <li key={f.family}>
              {FAMILY_LABEL[f.family]} : {score(f.a)} → {score(f.b)}
              {f.delta !== null && ` (${formatDelta(f.delta)})`}
            </li>
          ))}
      </ul>
      {shown.length > 0 ? (
        <>
          <p className="text-ink-500">Facteurs qui expliquent l’écart :</p>
          <ul className="text-ink-300 flex flex-col gap-0.5">
            {shown.map((d) => (
              <li key={`${d.analyzer}-${d.label}`} className="break-words">
                {ANALYZER_LABEL[d.analyzer]} · {d.label} :{' '}
                {d.a === null ? 'ne s’applique pas' : formatContribution(d.a)} →{' '}
                {d.b === null ? 'ne s’applique pas' : formatContribution(d.b)}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-ink-500">Aucun facteur compté ne diffère.</p>
      )}
      {difference.coverageDiffers.length > 0 && (
        <p className="text-ink-500">
          Donnée présente d’un seul côté :{' '}
          {difference.coverageDiffers.map((id) => ANALYZER_LABEL[id]).join(', ')} — un
          écart peut venir d’une donnée manquante, pas d’un terrain différent.
        </p>
      )}
      {difference.sharedUniform.length > 0 && (
        <p className="text-ink-500">
          Identiques parce qu’ils valent pour toute la zone (aucun pouvoir explicatif) :{' '}
          {difference.sharedUniform.join(', ')}.
        </p>
      )}
    </div>
  )
}

/** « Pourquoi cette cellule diffère de la précédente ? » — soustraction de
 * facteurs déjà affichés, rien de plus. */
export function CellDifferencePanel({
  current,
  previous,
  where,
}: {
  current: CombinedAnalysis
  previous: CombinedAnalysis | null
  /** Ex. « à 2,4 km vers le NE ». */
  where: string
}) {
  const difference = useMemo(
    () => (previous ? diffAnalyses(current, previous) : null),
    [current, previous],
  )
  return (
    <section
      aria-label="Pourquoi cette cellule diffère"
      className="flex flex-col gap-1.5"
    >
      <h3 className="text-ink-100 text-xs font-semibold tracking-wide uppercase">
        Pourquoi elle diffère de l’autre cellule
      </h3>
      {difference ? (
        <>
          <p className="text-ink-500 text-[11px]">
            Comparée à la cellule ouverte précédemment ({where}).
          </p>
          <DifferenceList
            difference={difference}
            leftLabel="cette cellule"
            rightLabel="l’autre"
          />
        </>
      ) : (
        <p className="text-ink-500 text-xs">
          Ouvrez une seconde cellule pour voir précisément quels facteurs les distinguent.
        </p>
      )}
    </section>
  )
}

/** « Comparer maintenant et un autre créneau disponible » : deux calculs
 * purs sur le vent et la météo déjà chargés — aucune requête. */
export function SlotComparisonPanel({
  statics,
  windField,
  weather,
  hourOptions,
  compareHourKey,
  sampleSpacingMeters,
  onChange,
}: {
  statics: CellStatic
  windField: WindField | null
  weather: WeatherForecast | null
  hourOptions: HourOption[]
  compareHourKey: string | null
  sampleSpacingMeters: number
  onChange: (hourKey: string | null) => void
}) {
  const choices = hourOptions.filter((o) => o.kind !== 'current')
  const comparison = useMemo(() => {
    if (!compareHourKey) return null
    const now = new Date()
    const tz = dataTimeZone(windField, weather)
    return compareSlots(
      statics,
      resolveHour(null, now, tz),
      resolveHour(compareHourKey, now, tz),
      { windField, weather },
      { sampleSpacingMeters, weatherScope: 'zone-center' },
    )
  }, [statics, compareHourKey, windField, weather, sampleSpacingMeters])
  const chosen = hourOptions.find((o) => o.hourKey === compareHourKey)

  return (
    <section aria-label="Comparer deux créneaux" className="flex flex-col gap-1.5">
      <h3 className="text-ink-100 text-xs font-semibold tracking-wide uppercase">
        Comparer maintenant et un autre créneau
      </h3>
      {choices.length === 0 ? (
        <p className="text-ink-500 text-xs">
          Aucun autre créneau n’est présent dans les données chargées.
        </p>
      ) : (
        <label className="flex flex-col gap-1">
          <span className="text-ink-500 text-xs">Créneau à comparer</span>
          <select
            aria-label="Créneau à comparer"
            value={compareHourKey ?? ''}
            onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
            className="border-surface-600 bg-surface-800 text-ink-100 focus-visible:outline-brand-400 w-full rounded-md border px-2 py-1.5 text-sm outline-none focus-visible:outline-2 pointer-coarse:min-h-11"
          >
            <option value="">Choisir un créneau…</option>
            {choices.map((o) => (
              <option key={o.hourKey} value={o.hourKey}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {comparison && chosen && (
        <DifferenceList
          difference={comparison.difference}
          leftLabel="maintenant"
          rightLabel={chosen.label.toLowerCase()}
        />
      )}
    </section>
  )
}
