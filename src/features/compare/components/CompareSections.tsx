import type { ReactNode } from 'react'
import { Check, Minus, X } from 'lucide-react'
import { Badge } from '@/components/ui'
import { cn } from '@/utils/cn'
import { formatDistanceMeters, formatNumberFr } from '@/utils/format'
import { compassLabel } from '@/utils/terrain'
import { ageOf, sampleDistanceText, windSummary, STATUS_LABEL } from '../format'
import type {
  CacheComparison,
  CriterionStatus,
  RankEntry,
  WaypointComparison,
} from '../types'

/** Une ligne de comparaison : même contenu en carte (empilé) et en tableau. */
export interface CompareSection {
  key: string
  label: string
  render: (row: WaypointComparison) => ReactNode
}

function statusIcon(status: CriterionStatus) {
  const Icon = status === 'met' ? Check : status === 'not-met' ? X : Minus
  return (
    <Icon
      size={14}
      aria-hidden="true"
      className={cn(
        'mt-0.5 shrink-0',
        status === 'met' && 'text-status-success',
        status === 'not-met' && 'text-status-danger',
        status === 'not-evaluable' && 'text-ink-500',
      )}
    />
  )
}

function renderList(items: string[], empty: string) {
  if (items.length === 0) return <span className="text-ink-500">{empty}</span>
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => (
        <li key={item} className="break-words">
          {item}
        </li>
      ))}
    </ul>
  )
}

function rankLabel(comparison: CacheComparison, entry: RankEntry | undefined): ReactNode {
  const { ranking } = comparison
  if (ranking.status === 'not-comparable') {
    const excluded = ranking.excluded.length > 0
    return (
      <span className="text-ink-300">
        {excluded ? 'Non classé (trop de données manquantes)' : 'Aucun classement'}
      </span>
    )
  }
  if (!entry)
    return <span className="text-ink-300">Non classé (trop de données manquantes)</span>
  if (ranking.status === 'tied') {
    return <span className="text-ink-100">Ex æquo (aucun ordre établi)</span>
  }
  const tied = ranking.entries.filter((e) => e.rank === entry.rank).length > 1
  return (
    <span className="text-ink-100 font-semibold">
      Rang {entry.rank}
      {tied ? ' (ex æquo)' : ''}
    </span>
  )
}

export function buildSections(
  comparison: CacheComparison,
  nowMs: number,
): CompareSection[] {
  const entryOf = (row: WaypointComparison) =>
    comparison.ranking.entries.find((e) => e.waypointId === row.waypointId)

  return [
    {
      key: 'rank',
      label: 'Classement',
      render: (row) => {
        const entry = entryOf(row)
        return (
          <div className="flex flex-col gap-1">
            {rankLabel(comparison, entry)}
            {entry && comparison.ranking.status !== 'not-comparable' && (
              <ul className="text-ink-300 flex flex-col gap-1 text-xs">
                {entry.reasons.map((reason) => (
                  <li key={reason} className="break-words">
                    {reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      },
    },
    {
      key: 'coverage',
      label: 'Couverture',
      render: (row) => (
        <div className="flex flex-col gap-1">
          <span className="text-ink-100 font-medium">{row.coverage.text}</span>
          {row.coverage.missing.length > 0 && (
            <span className="text-ink-500 text-xs">
              Non évaluables :{' '}
              {row.coverage.missing
                .map((id) => comparison.criteria.find((c) => c.id === id)?.label ?? id)
                .join(' ; ')}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'wind',
      label: 'Vent et rafales',
      render: (row) =>
        row.wind.status === 'available' ? (
          <div className="flex flex-col gap-1">
            <span className="text-ink-100">{windSummary(row.wind)}</span>
            <span className="text-ink-500 text-xs">
              {row.wind.timeLabel} · valeur du modèle de {row.wind.dataTime.slice(11, 16)}{' '}
              · {sampleDistanceText(row.wind)}
            </span>
            <span className="text-ink-500 text-xs">Source : {row.wind.source}</span>
          </div>
        ) : (
          <span className="text-ink-500">{row.wind.reason}</span>
        ),
    },
    {
      key: 'preference',
      label: 'Directions de vent préférées',
      render: (row) => (
        <div className="flex flex-col gap-1">
          {row.windPreference.directions.length > 0 && (
            <span className="text-ink-300 text-xs">
              Enregistrées : {row.windPreference.directions.map(compassLabel).join(', ')}
            </span>
          )}
          <span
            className={cn(
              row.windPreference.compatible === true && 'text-status-success',
              row.windPreference.compatible === false && 'text-status-danger',
              row.windPreference.compatible === null && 'text-ink-500',
            )}
          >
            {row.windPreference.compatible === null
              ? row.windPreference.note
              : row.windPreference.compatible
                ? `Compatible. ${row.windPreference.note}`
                : `Non compatible. ${row.windPreference.note}`}
          </span>
        </div>
      ),
    },
    {
      key: 'conditions',
      label: 'Conditions météo',
      render: (row) =>
        row.conditions.status === 'available' ? (
          <div className="flex flex-col gap-1">
            <span className="text-ink-100">
              {formatNumberFr(row.conditions.temperatureCelsius)} °C ·{' '}
              {formatNumberFr(row.conditions.precipitationMm, 1)} mm/h ·{' '}
              {formatNumberFr(row.conditions.cloudCoverPercent)} % de nuages
            </span>
            <span>
              <Badge variant={row.conditions.timeKind === 'current' ? 'success' : 'info'}>
                {row.conditions.timeKind === 'current'
                  ? 'Actuel'
                  : row.conditions.timeKind === 'forecast'
                    ? 'Prévision'
                    : 'Heure passée'}
              </Badge>
            </span>
            <span className="text-ink-500 text-xs">{row.conditions.timeLabel}</span>
            <span className="text-ink-500 text-xs">Source : {row.conditions.source}</span>
          </div>
        ) : (
          <span className="text-ink-500">{row.conditions.reason}</span>
        ),
    },
    {
      key: 'habitat',
      label: 'Habitat',
      render: (row) => (
        <div className="flex flex-col gap-1">
          <span
            className={row.habitat.state === 'informed' ? 'text-ink-100' : 'text-ink-500'}
          >
            {row.habitat.state === 'informed' ? 'Renseigné' : 'Non renseigné'}
          </span>
          <span className="text-ink-500 text-xs">{row.habitat.summary}</span>
          {row.habitat.vegetation.factors.length > 0 && (
            <span className="text-ink-300 text-xs">
              {row.habitat.vegetation.factors.map((f) => f.label).join(' ; ')}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'observations',
      label: 'Observations personnelles',
      render: (row) => {
        const o = row.observations
        return (
          <ul className="flex flex-col gap-1">
            <li>
              Visites (traces GPS) : <strong>{o.visits.count}</strong>
              <span className="text-ink-500 text-xs"> · information seulement</span>
            </li>
            <li>
              Signes de gibier : <strong>{o.gameSigns.count}</strong>
            </li>
            <li>
              Entrées de journal : <strong>{o.journalEntries.count}</strong>
            </li>
            <li className="text-ink-500">
              Animaux observés : non disponible (aucune donnée structurée)
            </li>
            <li className="text-ink-500 text-xs">Rayon : {o.radiusMeters} m</li>
          </ul>
        )
      },
    },
    {
      key: 'position',
      label: 'Distance depuis ma position',
      render: (row) =>
        row.position.status === 'available' ? (
          <div className="flex flex-col gap-1">
            <span className="text-ink-100">
              {formatDistanceMeters(row.position.distanceMeters)}{' '}
              <span className="text-ink-500 text-xs">à vol d’oiseau</span>
            </span>
            <span className="text-ink-500 text-xs">
              Précision ±{Math.round(row.position.accuracyMeters)} m ·{' '}
              {row.position.ageText}
            </span>
          </div>
        ) : (
          <span className="text-ink-500">{row.position.reason}</span>
        ),
    },
    {
      key: 'age',
      label: 'Âge des données',
      render: (row) => (
        <ul className="text-ink-300 flex flex-col gap-1 text-xs">
          <li>Vent et météo : chargés {ageOf(row.dataAge.windFetchedAt, nowMs)}</li>
          <li>Végétation : chargée {ageOf(row.dataAge.vegetationFetchedAt, nowMs)}</li>
          <li>Enregistrements : lus {ageOf(row.dataAge.recordsReadAt, nowMs)}</li>
        </ul>
      ),
    },
    {
      key: 'criteria',
      label: 'Critères',
      render: (row) => (
        <ul className="flex flex-col gap-2">
          {row.criteria.map((criterion) => {
            const def = comparison.criteria.find((c) => c.id === criterion.id)
            return (
              <li key={criterion.id} className="flex items-start gap-2">
                {statusIcon(criterion.status)}
                <span className="min-w-0">
                  <span className="text-ink-100 block break-words">
                    {def?.label} :{' '}
                    <span className="font-medium">{STATUS_LABEL[criterion.status]}</span>
                  </span>
                  <span className="text-ink-500 block text-xs break-words">
                    {criterion.detail}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      ),
    },
    {
      key: 'advantages',
      label: 'Avantages',
      render: (row) => renderList(row.advantages, 'Aucun avantage établi.'),
    },
    {
      key: 'drawbacks',
      label: 'Inconvénients',
      render: (row) => renderList(row.drawbacks, 'Aucun inconvénient établi.'),
    },
    {
      key: 'missing',
      label: 'Données manquantes',
      render: (row) => renderList(row.missingData, 'Aucune donnée manquante.'),
    },
  ]
}
