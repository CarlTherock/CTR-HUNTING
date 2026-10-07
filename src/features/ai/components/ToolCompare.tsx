import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Scale } from 'lucide-react'
import { EmptyState } from '@/components/ui'
import { compareCaches } from '@/features/compare/compareCaches'
import { MAX_WAYPOINTS, MIN_WAYPOINTS } from '@/features/compare/criteria'
import {
  availableHours,
  effectiveHourKey,
  useCompareStore,
} from '@/features/compare/state/compareStore'
import { categoryLabel } from '../records'
import { describeCacheComparison } from '../cacheComparison'
import { useAssistantRecords } from '../state/useAssistantRecords'
import { CONTROL, Field } from './fields'
import { ResultView } from './ResultView'
import { ToolIntro } from './TaskResult'

const SHOWN_MAX = 60

/**
 * « Comparer des caches » : réutilise la sélection (2 à 4 points), le
 * chargeur de données et le moteur `compareCaches` du comparateur existant ;
 * l'assistant ne fait que mettre le résultat en forme.
 */
export function ToolCompare() {
  const { records } = useAssistantRecords()
  const navigate = useNavigate()
  const selectedIds = useCompareStore((s) => s.selectedIds)
  const toggleSelected = useCompareStore((s) => s.toggleSelected)
  const clearSelection = useCompareStore((s) => s.clearSelection)
  const status = useCompareStore((s) => s.status)
  const dataset = useCompareStore((s) => s.dataset)
  const compareRecords = useCompareStore((s) => s.records)
  const hourKey = useCompareStore((s) => s.hourKey)
  const setHourKey = useCompareStore((s) => s.setHourKey)
  const load = useCompareStore((s) => s.load)
  const openPanel = useCompareStore((s) => s.openPanel)
  const [filter, setFilter] = useState('')

  const waypoints = records.waypoints
  const selected = useMemo(
    () =>
      selectedIds
        .map((id) => waypoints.find((w) => w.id === id))
        .filter((w): w is NonNullable<typeof w> => w !== undefined),
    [selectedIds, waypoints],
  )
  const selectionKey = selected.map((w) => w.id).join('|')

  // Charge (vent, végétation, enregistrements) pour la sélection ; le magasin
  // annule la requête précédente quand la sélection change.
  useEffect(() => {
    if (selected.length >= MIN_WAYPOINTS) void load()
    // `selected` est résumé par `selectionKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey, load])

  // « Maintenant » = l'instant où les données ont été lues : le résultat ne
  // change donc pas tant que les données ne changent pas.
  const loadedAt = useCompareStore((s) => s.loadedAt)
  const nowMs = loadedAt ? Date.parse(loadedAt) : 0
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
            records: compareRecords,
            // Pas de lecture GPS depuis cette page (aucune demande de
            // permission) : la distance depuis votre position est « indisponible ».
            gps: null,
            nowMs,
          })
        : null,
    [dataset, status, selected, effKey, now, compareRecords, nowMs],
  )
  const result = useMemo(
    () => (comparison ? describeCacheComparison(comparison, { records, now }) : null),
    [comparison, records, now],
  )

  const needle = filter.trim().toLocaleLowerCase('fr-CA')
  const candidates = useMemo(
    () =>
      [...waypoints]
        .filter((w) => !needle || w.name.toLocaleLowerCase('fr-CA').includes(needle))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr-CA', { sensitivity: 'base' })),
    [waypoints, needle],
  )

  if (waypoints.length < MIN_WAYPOINTS) {
    return (
      <div className="flex flex-col gap-3">
        <ToolIntro>
          Compare 2 à 4 points de repère pour un même créneau horaire.
        </ToolIntro>
        <EmptyState
          title="Pas assez de points de repère"
          description={`Il en faut au moins ${MIN_WAYPOINTS} pour comparer. Créez-les depuis la page Carte.`}
        />
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ToolIntro>
        Choisissez {MIN_WAYPOINTS} à {MAX_WAYPOINTS} points : le comparateur de caches
        existant fait le calcul, l’assistant en met le résultat en forme (critères,
        valeurs, données manquantes, ordre et raisons). Ce n’est pas une prévision de
        réussite.
      </ToolIntro>

      <Field label="Filtrer la liste par nom">
        {(id) => (
          <input
            id={id}
            type="search"
            className={CONTROL}
            maxLength={60}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        )}
      </Field>

      <ul
        className="border-surface-700 divide-surface-800 max-h-64 divide-y overflow-y-auto rounded-md border"
        aria-label="Points de repère à comparer"
      >
        {candidates.slice(0, SHOWN_MAX).map((w) => {
          const checked = selectedIds.includes(w.id)
          const disabled = !checked && selectedIds.length >= MAX_WAYPOINTS
          return (
            <li key={w.id}>
              <label
                className={`flex min-h-11 items-center gap-3 px-3 text-sm ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
              >
                <input
                  type="checkbox"
                  className="accent-brand-500 size-5 shrink-0"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggleSelected(w.id)}
                />
                <span className="text-ink-100 min-w-0 break-words">
                  {w.name}{' '}
                  <span className="text-ink-500">· {categoryLabel(w.category)}</span>
                </span>
              </label>
            </li>
          )
        })}
        {candidates.length === 0 && (
          <li className="text-ink-500 px-3 py-3 text-sm">Aucun point ne correspond.</li>
        )}
      </ul>
      {candidates.length > SHOWN_MAX && (
        <p className="text-ink-500 text-xs">
          {candidates.length - SHOWN_MAX} autre(s) point(s) : affinez le filtre.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink-300 text-sm" aria-live="polite">
          {selectedIds.length} sélectionné(s)
        </span>
        {selectedIds.length > 0 && (
          <button
            type="button"
            onClick={clearSelection}
            className="text-ink-300 hover:text-ink-100 min-h-11 px-2 text-sm"
          >
            Tout décocher
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            openPanel()
            navigate('/waypoints')
          }}
          disabled={selectedIds.length < MIN_WAYPOINTS}
          className="border-surface-600 text-ink-100 hover:bg-surface-800 inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm disabled:opacity-50"
        >
          <Scale size={16} aria-hidden="true" />
          Ouvrir le comparateur complet
        </button>
      </div>

      {selectedIds.length < MIN_WAYPOINTS && (
        <p className="text-ink-500 text-sm">
          Cochez au moins {MIN_WAYPOINTS} points pour obtenir la comparaison.
        </p>
      )}
      {selectedIds.length >= MIN_WAYPOINTS && status === 'loading' && (
        <p className="text-ink-300 text-sm" role="status" aria-live="polite">
          Chargement du vent, de la météo et de la végétation…
        </p>
      )}

      {hours.length > 0 && (
        <Field label="Créneau comparé">
          {(id) => (
            <select
              id={id}
              className={CONTROL}
              value={selectValue}
              onChange={(e) => {
                const option = hours.find((o) => o.hourKey === e.target.value)
                setHourKey(!option || option.kind === 'current' ? null : option.hourKey)
              }}
            >
              {hours.map((o) => (
                <option key={o.hourKey} value={o.hourKey}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}

      {result && <ResultView result={result} />}
    </div>
  )
}
