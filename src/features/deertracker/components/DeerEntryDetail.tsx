import { useId, useState } from 'react'
import { MapPin, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button } from '@/components/ui'
import { JournalPhotos } from '@/features/journal/components/JournalPhotos'
import { useJournalStore } from '@/features/journal/state/journalStore'
import { useMapStore } from '@/features/map/state/mapStore'
import { TerritorySelect } from '@/features/territories/components/TerritorySelect'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { compassLabel } from '@/utils/terrain'
import type {
  DeerAgeClass,
  DeerEntry,
  DeerEntryKind,
  DeerSex,
  Observation,
} from '@/types'
import {
  COMPASS_DIRECTIONS,
  DEER_AGE_LABEL,
  DEER_KINDS,
  DEER_KIND_LABEL,
  DEER_SEX_LABEL,
  fromDatetimeLocal,
  parseCount,
  toDatetimeLocal,
} from '../deerLogic'
import { ChoiceChips, Field, INPUT_CLASS } from './fields'

/** Rebuilds the deer record from edited values; empty values are omitted so
 * nothing is ever stored that the user did not enter. */
function buildDeer(
  base: DeerEntry,
  patch: Partial<Record<keyof DeerEntry, unknown>>,
): DeerEntry {
  const merged: Record<string, unknown> = { ...base, ...patch }
  const kept = Object.entries(merged).filter(([, v]) => v !== undefined && v !== '')
  return Object.fromEntries(kept) as unknown as DeerEntry
}

/** Details of one entry: everything but the position can be edited. The
 * position is shown as locked, with where it came from. */
export function DeerEntryDetail({
  entry,
  onClose,
}: {
  entry: Observation
  onClose: () => void
}) {
  const deer = entry.deer
  const update = useJournalStore((s) => s.update)
  const remove = useJournalStore((s) => s.remove)
  const setMapView = useMapStore((s) => s.setView)
  const waypoints = useWaypointsStore((s) => s.waypoints)
  const tracks = useTracksStore((s) => s.tracks)
  const navigate = useNavigate()
  const ids = {
    time: useId(),
    count: useId(),
    name: useId(),
    same: useId(),
    notes: useId(),
  }
  const [notes, setNotes] = useState(entry.notes)
  const [name, setName] = useState(deer?.name ?? '')
  const [same, setSame] = useState(deer?.sameAnimalNote ?? '')
  const [count, setCount] = useState(deer?.count !== undefined ? String(deer.count) : '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!deer) return null

  async function saveDeer(patch: Partial<Record<keyof DeerEntry, unknown>>) {
    if (!deer) return
    try {
      setError(null)
      await update(entry.id, { deer: buildDeer(deer, patch) })
    } catch {
      setError('La modification n’a pas pu être enregistrée.')
    }
  }

  const origin =
    entry.positionOrigin === 'gps'
      ? 'GPS'
      : entry.positionOrigin === 'manual'
        ? 'placée à la main'
        : 'origine non enregistrée'
  const accuracy =
    entry.coordinate.accuracyMeters !== undefined
      ? ` ±${Math.round(entry.coordinate.accuracyMeters)} m`
      : ''

  return (
    <section
      aria-label="Détails de l’observation"
      className="border-surface-700 bg-surface-900 flex flex-col gap-4 rounded-lg border p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-ink-100 text-sm font-semibold">
          {DEER_KIND_LABEL[deer.kind]}
        </h2>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Fermer
        </Button>
      </div>

      <div className="text-ink-300 flex flex-col gap-1 text-xs">
        <p className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral">Position verrouillée</Badge>
          {entry.coordinate.lat.toFixed(5)}, {entry.coordinate.lng.toFixed(5)} · {origin}
          {accuracy}
        </p>
        <p>
          Observée le {new Date(entry.timestamp).toLocaleString('fr-CA')}
          {entry.createdAt &&
            ` · saisie le ${new Date(entry.createdAt).toLocaleString('fr-CA')}`}
        </p>
        {entry.conditions ? (
          <p>
            Conditions : {Math.round(entry.conditions.temperatureCelsius)} °C ·{' '}
            {Math.round(entry.conditions.windSpeedKmh)} km/h de{' '}
            {compassLabel(entry.conditions.windDirectionDegrees)} ·{' '}
            {Math.round(entry.conditions.cloudCoverPercent)} % nuageux
            {entry.conditionsMeta &&
              ` (source ${entry.conditionsMeta.source}, relevé du ${new Date(entry.conditionsMeta.fetchedAt).toLocaleString('fr-CA')}${entry.conditionsMeta.cached ? ', données en cache' : ''})`}
          </p>
        ) : (
          <p>Conditions : non renseignées.</p>
        )}
      </div>

      <Field label="Type">
        <ChoiceChips
          label="Type d’observation"
          value={deer.kind}
          options={DEER_KINDS.map((k) => ({
            value: k as DeerEntryKind,
            label: DEER_KIND_LABEL[k],
          }))}
          onChange={(kind) => void saveDeer({ kind })}
        />
      </Field>

      <Field label="Date et heure de l’observation" htmlFor={ids.time}>
        <input
          id={ids.time}
          type="datetime-local"
          defaultValue={toDatetimeLocal(new Date(entry.timestamp).getTime())}
          onBlur={(e) => {
            const ms = fromDatetimeLocal(e.target.value)
            if (ms !== null && ms !== new Date(entry.timestamp).getTime()) {
              void update(entry.id, { timestamp: new Date(ms).toISOString() })
            }
          }}
          className={INPUT_CLASS}
        />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Nombre observé" htmlFor={ids.count}>
          <input
            id={ids.count}
            inputMode="numeric"
            value={count}
            onChange={(e) => setCount(e.target.value)}
            onBlur={() => void saveDeer({ count: parseCount(count) })}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Sexe">
          <select
            aria-label="Sexe"
            value={deer.sex ?? ''}
            onChange={(e) =>
              void saveDeer({ sex: (e.target.value || undefined) as DeerSex | undefined })
            }
            className={INPUT_CLASS}
          >
            <option value="">Non renseigné</option>
            {(Object.keys(DEER_SEX_LABEL) as DeerSex[]).map((v) => (
              <option key={v} value={v}>
                {DEER_SEX_LABEL[v]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Classe d’âge">
          <select
            aria-label="Classe d’âge"
            value={deer.ageClass ?? ''}
            onChange={(e) =>
              void saveDeer({
                ageClass: (e.target.value || undefined) as DeerAgeClass | undefined,
              })
            }
            className={INPUT_CLASS}
          >
            <option value="">Non renseignée</option>
            {(Object.keys(DEER_AGE_LABEL) as DeerAgeClass[]).map((v) => (
              <option key={v} value={v}>
                {DEER_AGE_LABEL[v]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Direction de déplacement observée">
        <select
          aria-label="Direction de déplacement observée"
          value={deer.travelDirectionDegrees ?? ''}
          onChange={(e) =>
            void saveDeer({
              travelDirectionDegrees:
                e.target.value === '' ? undefined : Number(e.target.value),
            })
          }
          className={INPUT_CLASS}
        >
          <option value="">Non observée</option>
          {COMPASS_DIRECTIONS.map((d) => (
            <option key={d.degrees} value={d.degrees}>
              Vers le {d.label.toLowerCase()}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Nom (facultatif)" htmlFor={ids.name}>
        <input
          id={ids.name}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void saveDeer({ name: name.trim() || undefined })}
          className={INPUT_CLASS}
        />
      </Field>
      <Field
        label="Possiblement le même animal que…"
        htmlFor={ids.same}
        hint="Votre annotation : l’application n’identifie aucun individu."
      >
        <input
          id={ids.same}
          value={same}
          onChange={(e) => setSame(e.target.value)}
          onBlur={() => void saveDeer({ sameAnimalNote: same.trim() || undefined })}
          className={INPUT_CLASS}
        />
      </Field>

      <Field label="Notes" htmlFor={ids.notes}>
        <textarea
          id={ids.notes}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => void update(entry.id, { notes })}
          rows={3}
          className={`${INPUT_CLASS} py-2`}
        />
      </Field>

      <TerritorySelect
        value={entry.territoryId}
        onChange={(territoryId) => void update(entry.id, { territoryId })}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Point de repère lié">
          <select
            aria-label="Point de repère lié"
            value={entry.waypointId ?? ''}
            onChange={(e) =>
              void update(entry.id, { waypointId: e.target.value || undefined })
            }
            className={INPUT_CLASS}
          >
            <option value="">Aucun</option>
            {waypoints.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sortie ou trace liée">
          <select
            aria-label="Trace liée"
            value={entry.trackId ?? ''}
            onChange={(e) =>
              void update(entry.id, { trackId: e.target.value || undefined })
            }
            className={INPUT_CLASS}
          >
            <option value="">Aucune</option>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <JournalPhotos observationId={entry.id} photoIds={entry.photoIds ?? []} />

      {error && (
        <p role="alert" className="text-status-danger text-sm">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            setMapView({ center: entry.coordinate })
            navigate('/map')
          }}
        >
          <MapPin size={16} aria-hidden="true" />
          Voir sur la carte
        </Button>
        {confirmDelete ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-ink-300 text-sm">
              Supprimer cette observation et ses photos ?
            </span>
            <Button
              variant="danger"
              onClick={() => {
                void remove(entry.id).then(onClose)
              }}
            >
              Confirmer la suppression
            </Button>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Conserver
            </Button>
          </span>
        ) : (
          <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={16} aria-hidden="true" />
            Supprimer
          </Button>
        )}
      </div>
    </section>
  )
}
