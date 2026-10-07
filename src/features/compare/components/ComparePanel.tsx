import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { RefreshCw, Scale, X } from 'lucide-react'
import { Badge, Card } from '@/components/ui'
import { useGeolocation } from '@/features/gps/useGeolocation'
import { useGpsClock } from '@/features/gps/useGpsClock'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { cn } from '@/utils/cn'
import { compareCaches } from '../compareCaches'
import { CRITERIA, MIN_WAYPOINTS } from '../criteria'
import { ageOf } from '../format'
import { availableHours, effectiveHourKey, useCompareStore } from '../state/compareStore'
import type { CompareDataset } from '../compareData'
import type { CacheComparison } from '../types'
import { AssociatedObservations } from './AssociatedObservations'
import { CompareResults } from './CompareResults'

const SELECT =
  'border-surface-600 bg-surface-800 text-ink-100 focus-visible:outline-brand-400 min-h-11 w-full min-w-0 rounded-md border px-3 text-base outline-none focus-visible:outline-2'

function originText(origin: CompareDataset['windOrigin'], label: string | null): string {
  if (origin === 'map') return `réutilisé (${label ?? 'carte'})`
  if (origin === 'cache') return 'cache mémoire'
  return 'requête groupée'
}

function SourcesLine({ dataset, nowMs }: { dataset: CompareDataset; nowMs: number }) {
  const wind =
    dataset.wind.status === 'ok'
      ? `Vent et météo : ${originText(dataset.windOrigin, dataset.windOriginLabel)}, chargés ${ageOf(dataset.wind.fetchedAt, nowMs)}`
      : dataset.wind.status === 'error'
        ? `Vent et météo : indisponibles (${dataset.wind.reason})`
        : 'Vent et météo : non chargés'
  const vegetation =
    dataset.vegetationState.status === 'ok'
      ? `Végétation : ${originText(dataset.vegetationOrigin, null)}, chargée ${ageOf(dataset.vegetationState.fetchedAt, nowMs)}`
      : dataset.vegetationState.status === 'error'
        ? `Végétation : indisponible (${dataset.vegetationState.reason})`
        : dataset.vegetationState.status === 'skipped'
          ? `Végétation : ${dataset.vegetationState.reason}`
          : 'Végétation : non chargée'
  return (
    <ul
      className="text-ink-500 flex flex-col gap-0.5 text-xs"
      aria-label="Sources des données"
    >
      <li>{wind}</li>
      <li>{vegetation}</li>
      <li>
        Enregistrements personnels : lus sur l’appareil, tous territoires confondus.
      </li>
    </ul>
  )
}

function RankingBlock({ comparison }: { comparison: CacheComparison }) {
  const { ranking } = comparison
  const names = new Map(comparison.rows.map((r) => [r.waypointId, r.name]))
  const title =
    ranking.status === 'ranked'
      ? 'Classement par critères'
      : ranking.status === 'tied'
        ? 'Aucun ordre : points identiques'
        : 'Points non comparables'
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-ink-100 text-sm font-semibold">{title}</h3>
        <Badge
          variant={
            ranking.status === 'ranked'
              ? 'brand'
              : ranking.status === 'tied'
                ? 'neutral'
                : 'warning'
          }
        >
          {ranking.status === 'ranked'
            ? 'Tri documenté'
            : ranking.status === 'tied'
              ? 'Ex æquo'
              : 'Pas de classement'}
        </Badge>
      </div>
      <p className="text-ink-300 text-sm break-words" role="status">
        {ranking.summary}
      </p>
      {ranking.status === 'ranked' && (
        <ol className="flex flex-col gap-1 text-sm">
          {ranking.entries.map((entry) => (
            <li key={entry.waypointId} className="text-ink-100 break-words">
              <span className="font-semibold">Rang {entry.rank}</span> —{' '}
              {names.get(entry.waypointId)} ({entry.metCount}/{entry.commonCount} critères
              communs satisfaits)
            </li>
          ))}
        </ol>
      )}
      {ranking.excluded.length > 0 && (
        <ul className="text-ink-500 flex flex-col gap-1 text-xs">
          {ranking.excluded.map((e) => (
            <li key={e.waypointId} className="break-words">
              {e.reason}
            </li>
          ))}
        </ul>
      )}
      <details className="text-sm">
        <summary className="text-brand-400 flex min-h-11 cursor-pointer items-center">
          Critères et règles du tri
        </summary>
        <div className="flex flex-col gap-3 pb-2">
          <ul className="flex flex-col gap-2">
            {CRITERIA.map((criterion) => (
              <li key={criterion.id} className="text-ink-300 text-xs break-words">
                <span className="text-ink-100 font-medium">{criterion.label}</span> —{' '}
                {criterion.rule}{' '}
                <span className="text-ink-500">Requiert : {criterion.requires}</span>
              </li>
            ))}
          </ul>
          <ul className="text-ink-300 flex list-disc flex-col gap-1 pl-4 text-xs">
            {comparison.rules.map((rule) => (
              <li key={rule} className="break-words">
                {rule}
              </li>
            ))}
          </ul>
        </div>
      </details>
    </Card>
  )
}

/**
 * Panneau de comparaison de 2 à 4 points de repère pour un même créneau. Il
 * charge les données par UNE requête groupée (voir `compareData.ts`), puis
 * `compareCaches` (pur) produit le résultat affiché. Changer de créneau ne
 * déclenche aucune requête.
 */
export function ComparePanel() {
  const selectedIds = useCompareStore((s) => s.selectedIds)
  const panelOpen = useCompareStore((s) => s.panelOpen)
  const status = useCompareStore((s) => s.status)
  const dataset = useCompareStore((s) => s.dataset)
  const records = useCompareStore((s) => s.records)
  const hourKey = useCompareStore((s) => s.hourKey)
  const setHourKey = useCompareStore((s) => s.setHourKey)
  const load = useCompareStore((s) => s.load)
  const refresh = useCompareStore((s) => s.refresh)
  const closePanel = useCompareStore((s) => s.closePanel)
  const waypoints = useWaypointsStore((s) => s.waypoints)

  const selected = useMemo(
    () =>
      selectedIds
        .map((id) => waypoints.find((w) => w.id === id))
        .filter((w): w is NonNullable<typeof w> => w !== undefined),
    [selectedIds, waypoints],
  )
  const selectionKey = selected.map((w) => w.id).join('|')

  // Recharge à l'ouverture et à chaque changement de sélection ; le magasin
  // annule la requête précédente (AbortController).
  useEffect(() => {
    if (panelOpen) void load()
  }, [panelOpen, selectionKey, load])

  const sectionRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (panelOpen) sectionRef.current?.scrollIntoView?.({ block: 'start' })
  }, [panelOpen])

  const gps = useGeolocation()
  const nowMs = useGpsClock()
  const now = useMemo(() => new Date(nowMs), [nowMs])

  const hours = useMemo(() => availableHours(dataset, now), [dataset, now])
  const effKey = effectiveHourKey(hourKey, hours)
  const currentOption = hours.find((o) => o.kind === 'current')
  const selectValue = effKey ?? currentOption?.hourKey ?? ''

  const comparison = useMemo(
    () =>
      dataset && status === 'ready' && selected.length >= MIN_WAYPOINTS
        ? compareCaches({
            waypoints: selected,
            hourKey: effKey,
            now,
            windField: dataset.windField,
            wind: dataset.wind,
            vegetation: dataset.vegetation,
            vegetationState: dataset.vegetationState,
            records,
            gps,
            nowMs,
          })
        : null,
    [dataset, status, selected, effKey, now, records, gps, nowMs],
  )

  const [observationsFor, setObservationsFor] = useState<string | null>(null)
  const hourId = useId()

  if (!panelOpen) return null

  const observationsRow = comparison?.rows.find((r) => r.waypointId === observationsFor)

  return (
    <section
      ref={sectionRef}
      aria-label="Comparaison de caches"
      className="border-brand-500/40 bg-surface-950 flex min-w-0 flex-col gap-4 rounded-lg border p-3 sm:p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-ink-100 flex items-center gap-2 text-base font-semibold">
            <Scale size={18} aria-hidden="true" />
            Comparaison de caches
          </h2>
          <p className="text-status-warning mt-1 text-sm font-medium">
            Comparaison indicative : ce n’est pas une prévision de réussite.
          </p>
        </div>
        <button
          type="button"
          onClick={closePanel}
          aria-label="Fermer la comparaison"
          className="text-ink-500 hover:text-ink-100 flex h-11 w-11 shrink-0 items-center justify-center"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      {selected.length < MIN_WAYPOINTS ? (
        <p className="text-ink-300 text-sm">
          Sélectionnez au moins {MIN_WAYPOINTS} points de repère pour les comparer.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <label htmlFor={hourId} className="text-ink-500 text-xs font-medium">
                Créneau horaire (heures présentes dans les données chargées)
              </label>
              <select
                id={hourId}
                value={selectValue}
                disabled={hours.length === 0}
                onChange={(event) => {
                  const next = event.target.value
                  setHourKey(next === currentOption?.hourKey ? null : next)
                }}
                className={cn(SELECT, hours.length === 0 && 'opacity-60')}
              >
                {hours.length === 0 && <option value="">Aucune heure disponible</option>}
                {hours.map((option) => (
                  <option key={option.hourKey} value={option.hourKey}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={status === 'loading'}
              className="border-surface-600 text-ink-100 hover:bg-surface-800 flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 text-sm disabled:opacity-50"
            >
              <RefreshCw size={16} aria-hidden="true" />
              Actualiser
            </button>
          </div>

          {status === 'loading' && (
            <p className="text-ink-300 text-sm" role="status">
              Chargement du vent, de la météo et de l’habitat pour {selected.length}{' '}
              points (requêtes groupées)…
            </p>
          )}

          {status === 'ready' && dataset && (
            <SourcesLine dataset={dataset} nowMs={nowMs} />
          )}

          {status === 'ready' && dataset && dataset.wind.status === 'error' && (
            <p
              role="alert"
              className="border-status-danger/40 text-status-danger rounded-md border p-3 text-sm"
            >
              Le vent et la météo n’ont pas pu être chargés ({dataset.wind.reason}). Les
              critères qui en dépendent sont « non évaluables » ; rien n’est remplacé par
              une valeur supposée.
            </p>
          )}

          {comparison && (
            <>
              <RankingBlock comparison={comparison} />
              <CompareResults
                comparison={comparison}
                nowMs={nowMs}
                observationsFor={observationsFor}
                onShowObservations={(id) =>
                  setObservationsFor((current) => (current === id ? null : id))
                }
              />
              {observationsRow && (
                <AssociatedObservations
                  row={observationsRow}
                  onClose={() => setObservationsFor(null)}
                />
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}
