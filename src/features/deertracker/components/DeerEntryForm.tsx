import { useId, useMemo, useState } from 'react'
import { Check, Crosshair, Map as MapIcon } from 'lucide-react'
import { Button } from '@/components/ui'
import { useGeolocation } from '@/features/gps/useGeolocation'
import { snapshotConditions } from '@/features/journal/conditionsSnapshot'
import { useJournalStore } from '@/features/journal/state/journalStore'
import { useMapStore } from '@/features/map/state/mapStore'
import { TerritorySelect } from '@/features/territories/components/TerritorySelect'
import { getActiveTerritoryId } from '@/features/territories/state/territoriesStore'
import type { Coordinate, DeerAgeClass, DeerEntry, DeerEntryKind, DeerSex } from '@/types'
import {
  COMPASS_DIRECTIONS,
  DEER_AGE_LABEL,
  DEER_KINDS,
  DEER_KIND_LABEL,
  DEER_SEX_LABEL,
  canAttachCurrentConditions,
  fromDatetimeLocal,
  parseCount,
  positionNotice,
  toDatetimeLocal,
} from '../deerLogic'
import { ChoiceChips, Field, INPUT_CLASS } from './fields'

type PositionChoice = 'gps' | 'map-center'

/** Fast entry: type, position and time are the only things asked; every
 * detail is optional and stays empty unless the user fills it. The saved
 * position is locked (details are edited later, never the point). */
export function DeerEntryForm({
  onSaved,
  onCancel,
}: {
  onSaved: (id: string) => void
  onCancel: () => void
}) {
  const ids = {
    time: useId(),
    count: useId(),
    name: useId(),
    same: useId(),
    notes: useId(),
  }
  const gps = useGeolocation()
  const mapCenter = useMapStore((state) => state.view.center)
  const create = useJournalStore((state) => state.create)
  const select = useJournalStore((state) => state.select)

  const [kind, setKind] = useState<DeerEntryKind>('sighting')
  const [choice, setChoice] = useState<PositionChoice | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [time, setTime] = useState(() => toDatetimeLocal(Date.now()))
  const [count, setCount] = useState('')
  const [sex, setSex] = useState<DeerSex | ''>('')
  const [age, setAge] = useState<DeerAgeClass | ''>('')
  const [direction, setDirection] = useState('')
  const [name, setName] = useState('')
  const [same, setSame] = useState('')
  const [notes, setNotes] = useState('')
  const [territoryId, setTerritoryId] = useState<string | undefined>(undefined)
  const [territoryTouched, setTerritoryTouched] = useState(false)
  const [withConditions, setWithConditions] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const gpsFix = gps.status === 'available' ? gps.value : null
  // GPS is used by default when there is a fix; the map centre is only used
  // when the user explicitly chooses it (and is then recorded as manual).
  const effectiveChoice: PositionChoice | null = choice ?? (gpsFix ? 'gps' : null)
  const position: Coordinate | null =
    effectiveChoice === 'gps' && gpsFix
      ? {
          lat: gpsFix.lat,
          lng: gpsFix.lng,
          ...(gpsFix.accuracyMeters !== undefined
            ? { accuracyMeters: gpsFix.accuracyMeters }
            : {}),
        }
      : effectiveChoice === 'map-center'
        ? { lat: mapCenter.lat, lng: mapCenter.lng }
        : null
  const notice = positionNotice(position !== null, position?.accuracyMeters)

  const observedMs = fromDatetimeLocal(time)
  const snapshot = useMemo(
    () => (position ? snapshotConditions(position) : undefined),
    // Recomputed when the position changes; stores are read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [position?.lat, position?.lng],
  )
  const conditionsAllowed =
    snapshot !== undefined &&
    observedMs !== null &&
    canAttachCurrentConditions(observedMs, now)

  async function save() {
    if (!position || observedMs === null) return
    setSaving(true)
    setError(null)
    const deer: DeerEntry = { kind }
    const n = parseCount(count)
    if (n !== undefined) deer.count = n
    if (sex) deer.sex = sex
    if (age) deer.ageClass = age
    if (direction !== '') deer.travelDirectionDegrees = Number(direction)
    if (name.trim()) deer.name = name.trim()
    if (same.trim()) deer.sameAnimalNote = same.trim()
    try {
      const saved = await create({
        coordinate: position,
        notes: notes.trim(),
        observedAt: new Date(observedMs).toISOString(),
        positionOrigin: effectiveChoice === 'gps' ? 'gps' : 'manual',
        deer,
        ...(territoryTouched ? { territoryId } : {}),
        ...(withConditions && conditionsAllowed && snapshot
          ? { conditions: snapshot.conditions, conditionsMeta: snapshot.meta }
          : {}),
      })
      // `create` also opens the entry in the Journal; DeerTracker keeps its own selection.
      select(null)
      onSaved(saved.id)
    } catch {
      setError(
        'L’observation n’a pas pu être enregistrée sur cet appareil. Rien n’a été perdu : réessayez.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      aria-label="Nouvelle observation"
      className="border-surface-700 bg-surface-900 flex flex-col gap-4 rounded-lg border p-3"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <h2 className="text-ink-100 text-sm font-semibold">Enregistrer une observation</h2>

      <Field label="Type">
        <ChoiceChips
          label="Type d’observation"
          value={kind}
          options={DEER_KINDS.map((k) => ({ value: k, label: DEER_KIND_LABEL[k] }))}
          onChange={setKind}
        />
      </Field>

      <Field label="Position">
        <div
          role="radiogroup"
          aria-label="Origine de la position"
          className="flex flex-wrap gap-2"
        >
          <button
            type="button"
            role="radio"
            aria-checked={effectiveChoice === 'gps'}
            disabled={!gpsFix}
            onClick={() => setChoice('gps')}
            className="border-surface-600 bg-surface-800 text-ink-100 aria-checked:border-brand-400 aria-checked:text-brand-400 flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium disabled:opacity-50"
          >
            <Crosshair size={16} aria-hidden="true" />
            Ma position GPS
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={effectiveChoice === 'map-center'}
            onClick={() => setChoice('map-center')}
            className="border-surface-600 bg-surface-800 text-ink-100 aria-checked:border-brand-400 aria-checked:text-brand-400 flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium"
          >
            <MapIcon size={16} aria-hidden="true" />
            Centre de la carte (manuel)
          </button>
        </div>
        <p
          role="status"
          className={
            notice === 'ok' ? 'text-ink-300 text-xs' : 'text-status-warning text-xs'
          }
        >
          {notice === 'none' &&
            (gpsFix
              ? 'Choisissez une position.'
              : 'Position absente : GPS indisponible. Choisissez « Centre de la carte » (position manuelle) ou attendez le GPS.')}
          {notice === 'ok' &&
            position &&
            `GPS ±${Math.round(position.accuracyMeters ?? 0)} m · ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`}
          {notice === 'imprecise' &&
            position &&
            (effectiveChoice === 'gps'
              ? `Position imprécise${position.accuracyMeters !== undefined ? ` (±${Math.round(position.accuracyMeters)} m)` : ''} · ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`
              : `Position manuelle : centre actuel de la carte · ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}. La précision est inconnue.`)}
        </p>
        <p className="text-ink-500 text-xs">
          Après l’enregistrement, la position est verrouillée : seuls les détails se
          modifient.
        </p>
      </Field>

      <Field label="Date et heure de l’observation" htmlFor={ids.time}>
        <input
          id={ids.time}
          type="datetime-local"
          value={time}
          onChange={(e) => {
            setTime(e.target.value)
            setNow(Date.now())
          }}
          className={INPUT_CLASS}
        />
        {observedMs === null && (
          <p role="alert" className="text-status-danger text-xs">
            Date ou heure invalide.
          </p>
        )}
      </Field>

      <details className="border-surface-700 rounded-lg border">
        <summary className="text-ink-100 flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium">
          Détails facultatifs
        </summary>
        <div className="flex flex-col gap-3 p-3">
          <Field label="Nombre observé" htmlFor={ids.count}>
            <input
              id={ids.count}
              inputMode="numeric"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              placeholder="Laisser vide si non compté"
              className={INPUT_CLASS}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Sexe (si vous l’avez déterminé)">
              <select
                aria-label="Sexe"
                value={sex}
                onChange={(e) => setSex(e.target.value as DeerSex | '')}
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
            <Field label="Classe d’âge (si vous l’avez déterminée)">
              <select
                aria-label="Classe d’âge"
                value={age}
                onChange={(e) => setAge(e.target.value as DeerAgeClass | '')}
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
          <Field
            label="Direction de déplacement observée"
            hint="Seulement si vous avez vu l’animal se déplacer : direction vers laquelle il allait."
          >
            <select
              aria-label="Direction de déplacement observée"
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
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
              className={INPUT_CLASS}
            />
          </Field>
          <Field
            label="Possiblement le même animal que…"
            htmlFor={ids.same}
            hint="Votre annotation personnelle : l’application n’identifie aucun individu."
          >
            <input
              id={ids.same}
              value={same}
              onChange={(e) => setSame(e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Notes" htmlFor={ids.notes}>
            <textarea
              id={ids.notes}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={`${INPUT_CLASS} py-2`}
            />
          </Field>
          <TerritorySelect
            value={territoryTouched ? territoryId : getActiveTerritoryId()}
            onChange={(id) => {
              setTerritoryTouched(true)
              setTerritoryId(id)
            }}
          />
          {conditionsAllowed ? (
            <label className="text-ink-100 flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={withConditions}
                onChange={(e) => setWithConditions(e.target.checked)}
                className="h-5 w-5"
              />
              Joindre les conditions actuelles (météo et vent déjà chargés)
            </label>
          ) : (
            <p className="text-ink-500 text-xs">
              Conditions : non jointes.{' '}
              {observedMs !== null && !canAttachCurrentConditions(observedMs, now)
                ? 'Les conditions actuelles ne décrivent pas un moment passé ou futur.'
                : 'Aucune météo et aucun vent chargés pour cette position.'}
            </p>
          )}
        </div>
      </details>

      {error && (
        <p role="alert" className="text-status-danger text-sm">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          size="lg"
          disabled={!position || observedMs === null || saving}
        >
          <Check size={18} aria-hidden="true" />
          Enregistrer
        </Button>
        <Button type="button" size="lg" variant="secondary" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  )
}
