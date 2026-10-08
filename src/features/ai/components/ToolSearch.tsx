import { useMemo, useState } from 'react'
import { Button } from '@/components/ui'
import { useMapStore } from '@/features/map/state/mapStore'
import { ALL_TERRITORIES } from '@/features/territories/filter'
import type { TerritoryFilter } from '@/features/territories/filter'
import { CATEGORY_OPTIONS } from '@/features/waypoints/categories'
import type { WaypointCategory } from '@/types'
import { TEXT_QUERY_MAX, searchHistoryAsync } from '../historySearch'
import type { SearchCriteria, SearchKind, SearchOutput } from '../historySearch'
import { useAssistantRecords } from '../state/useAssistantRecords'
import { useAssistantTask } from '../state/useAssistantTask'
import { CONTROL, CheckRow, Field, TerritoryScopeSelect } from './fields'
import { TaskResult, ToolIntro } from './TaskResult'

const KIND_LABEL: Record<SearchKind, string> = {
  waypoint: 'Points de repère',
  track: 'Traces',
  journal: 'Journal',
}
const KINDS: SearchKind[] = ['waypoint', 'track', 'journal']

const RADII: { value: number; label: string }[] = [
  { value: 100, label: '100 m' },
  { value: 500, label: '500 m' },
  { value: 1000, label: '1 km' },
  { value: 5000, label: '5 km' },
]

const DIRECTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Nord (0°)' },
  { value: 45, label: 'Nord-est (45°)' },
  { value: 90, label: 'Est (90°)' },
  { value: 135, label: 'Sud-est (135°)' },
  { value: 180, label: 'Sud (180°)' },
  { value: 225, label: 'Sud-ouest (225°)' },
  { value: 270, label: 'Ouest (270°)' },
  { value: 315, label: 'Nord-ouest (315°)' },
]

interface Draft {
  text: string
  kinds: SearchKind[]
  category: WaypointCategory | ''
  from: string
  to: string
  territory: TerritoryFilter
  nearMode: 'none' | 'map' | 'waypoint'
  nearWaypointId: string
  radius: number
  photo: 'any' | 'with' | 'without'
  windMin: string
  windMax: string
  windFrom: string
}

const INITIAL: Draft = {
  text: '',
  kinds: [],
  category: '',
  from: '',
  to: '',
  territory: ALL_TERRITORIES,
  nearMode: 'none',
  nearWaypointId: '',
  radius: 500,
  photo: 'any',
  windMin: '',
  windMax: '',
  windFrom: '',
}

function numberOrNull(raw: string): number | null {
  if (raw.trim() === '') return null
  const value = Number(raw.replace(',', '.'))
  return Number.isFinite(value) && value >= 0 ? value : null
}

/** « Rechercher l'historique par critères ». */
export function ToolSearch() {
  const { records, ready } = useAssistantRecords()
  const mapCenter = useMapStore((s) => s.view.center)
  const [draft, setDraft] = useState<Draft>(INITIAL)
  const [criteria, setCriteria] = useState<SearchCriteria | null>(null)
  const patch = (next: Partial<Draft>) => setDraft((d) => ({ ...d, ...next }))

  const run = useMemo(
    () =>
      ready && criteria
        ? (signal: AbortSignal) => searchHistoryAsync(records, criteria, { signal })
        : null,
    [ready, criteria, records],
  )
  const task = useAssistantTask(run)

  const sortedWaypoints = useMemo(
    () =>
      [...records.waypoints]
        .sort((a, b) => a.name.localeCompare(b.name, 'fr-CA', { sensitivity: 'base' }))
        .slice(0, 300),
    [records.waypoints],
  )

  function submit() {
    let near: SearchCriteria['near'] = null
    if (draft.nearMode === 'map') {
      near = {
        center: { lat: mapCenter.lat, lng: mapCenter.lng },
        radiusMeters: draft.radius,
      }
    } else if (draft.nearMode === 'waypoint') {
      const waypoint = records.waypoints.find((w) => w.id === draft.nearWaypointId)
      if (waypoint) near = { center: waypoint.coordinate, radiusMeters: draft.radius }
    }
    const windMin = numberOrNull(draft.windMin)
    const windMax = numberOrNull(draft.windMax)
    const windFrom = draft.windFrom === '' ? null : Number(draft.windFrom)
    setCriteria({
      text: draft.text,
      kinds: draft.kinds,
      category: draft.category || null,
      from: draft.from || null,
      to: draft.to || null,
      territory: draft.territory,
      near,
      hasPhoto: draft.photo === 'any' ? null : draft.photo === 'with',
      wind:
        windMin === null && windMax === null && windFrom === null
          ? null
          : {
              minSpeedKmh: windMin,
              maxSpeedKmh: windMax,
              fromDirection:
                windFrom === null ? null : { degrees: windFrom, toleranceDegrees: 22.5 },
            },
    })
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ToolIntro>
        Cherche dans vos points de repère, traces et entrées de journal. Les résultats
        vont du plus récent au plus ancien, chacun avec son lien. Le texte cherché est
        littéral (jamais une commande) ; le vent vient des conditions enregistrées dans
        l’entrée de journal.
      </ToolIntro>

      <form
        className="border-surface-700 flex min-w-0 flex-col gap-3 rounded-md border p-3"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        aria-label="Critères de recherche"
      >
        <Field label="Texte dans le nom ou la note">
          {(id) => (
            <input
              id={id}
              type="search"
              className={CONTROL}
              maxLength={TEXT_QUERY_MAX}
              value={draft.text}
              onChange={(e) => patch({ text: e.target.value })}
            />
          )}
        </Field>

        <fieldset className="flex flex-col">
          <legend className="text-ink-500 text-xs font-medium">
            Types d’éléments (aucun coché = tous)
          </legend>
          {KINDS.map((kind) => (
            <CheckRow
              key={kind}
              label={KIND_LABEL[kind]}
              checked={draft.kinds.includes(kind)}
              onChange={(checked) =>
                patch({
                  kinds: checked
                    ? [...draft.kinds, kind]
                    : draft.kinds.filter((k) => k !== kind),
                })
              }
            />
          ))}
        </fieldset>

        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
          <Field label="Catégorie (points de repère)">
            {(id) => (
              <select
                id={id}
                className={CONTROL}
                value={draft.category}
                onChange={(e) =>
                  patch({ category: e.target.value as WaypointCategory | '' })
                }
              >
                <option value="">Toutes</option>
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Photo">
            {(id) => (
              <select
                id={id}
                className={CONTROL}
                value={draft.photo}
                onChange={(e) => patch({ photo: e.target.value as Draft['photo'] })}
              >
                <option value="any">Peu importe</option>
                <option value="with">Avec photo</option>
                <option value="without">Sans photo</option>
              </select>
            )}
          </Field>
          <Field label="Du">
            {(id) => (
              <input
                id={id}
                type="date"
                className={CONTROL}
                value={draft.from}
                onChange={(e) => patch({ from: e.target.value })}
              />
            )}
          </Field>
          <Field label="Au (inclus)">
            {(id) => (
              <input
                id={id}
                type="date"
                className={CONTROL}
                value={draft.to}
                onChange={(e) => patch({ to: e.target.value })}
              />
            )}
          </Field>
        </div>

        <TerritoryScopeSelect
          value={draft.territory}
          onChange={(territory) => patch({ territory })}
        />

        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="text-ink-500 text-xs font-medium">Proximité</legend>
          <Field label="Autour de">
            {(id) => (
              <select
                id={id}
                className={CONTROL}
                value={draft.nearMode}
                onChange={(e) => patch({ nearMode: e.target.value as Draft['nearMode'] })}
              >
                <option value="none">Pas de critère de distance</option>
                <option value="map">Centre actuel de la carte</option>
                <option value="waypoint">Un point de repère</option>
              </select>
            )}
          </Field>
          {draft.nearMode === 'waypoint' && (
            <Field
              label="Point de repère"
              hint={
                records.waypoints.length > sortedWaypoints.length
                  ? 'Les 300 premiers points (ordre alphabétique) sont proposés.'
                  : undefined
              }
            >
              {(id) => (
                <select
                  id={id}
                  className={CONTROL}
                  value={draft.nearWaypointId}
                  onChange={(e) => patch({ nearWaypointId: e.target.value })}
                >
                  <option value="">Choisir…</option>
                  {sortedWaypoints.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
          {draft.nearMode !== 'none' && (
            <Field label="Rayon">
              {(id) => (
                <select
                  id={id}
                  className={CONTROL}
                  value={draft.radius}
                  onChange={(e) => patch({ radius: Number(e.target.value) })}
                >
                  {RADII.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
        </fieldset>

        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="text-ink-500 text-xs font-medium">
            Vent enregistré dans l’entrée de journal
          </legend>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
            <Field label="Vitesse minimale (km/h)">
              {(id) => (
                <input
                  id={id}
                  inputMode="decimal"
                  className={CONTROL}
                  value={draft.windMin}
                  onChange={(e) => patch({ windMin: e.target.value })}
                />
              )}
            </Field>
            <Field label="Vitesse maximale (km/h)">
              {(id) => (
                <input
                  id={id}
                  inputMode="decimal"
                  className={CONTROL}
                  value={draft.windMax}
                  onChange={(e) => patch({ windMax: e.target.value })}
                />
              )}
            </Field>
          </div>
          <Field label="Vent venant de (± 22,5°)">
            {(id) => (
              <select
                id={id}
                className={CONTROL}
                value={draft.windFrom}
                onChange={(e) => patch({ windFrom: e.target.value })}
              >
                <option value="">Peu importe</option>
                {DIRECTIONS.map((d) => (
                  <option key={d.value} value={String(d.value)}>
                    {d.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </fieldset>

        <Button type="submit" className="h-11 w-full sm:w-auto" disabled={!ready}>
          Rechercher
        </Button>
      </form>

      <TaskResult<SearchOutput> task={task} toResult={(output) => output.result} />
    </div>
  )
}
