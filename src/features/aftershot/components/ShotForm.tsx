import { useId, useState } from 'react'
import { Button } from '@/components/ui'
import {
  COMPASS_DIRECTIONS,
  fromDatetimeLocal,
  toDatetimeLocal,
} from '@/features/deertracker/deerLogic'
import { Field, INPUT_CLASS } from '@/features/deertracker/components/fields'
import { useGeolocation } from '@/features/gps/useGeolocation'
import { useJournalStore } from '@/features/journal/state/journalStore'
import { useMapStore } from '@/features/map/state/mapStore'
import type { Coordinate, ShotSpecies } from '@/types'
import { SHOT_SPECIES_LABEL, buildShotEntry } from '../shotLogic'
import { PositionPicker, type PositionChoice } from './PositionPicker'

/** « Consigner le tir ». The shot position and time are required; everything
 * else is optional and stays empty unless the user fills it. */
export function ShotForm({
  species,
  openSessionId,
  onSaved,
  onCancel,
}: {
  species: ShotSpecies
  /** An open blood search to link the shot to, if there is one. */
  openSessionId: string | null
  onSaved: (id: string) => void
  onCancel: () => void
}) {
  const ids = { time: useId(), reaction: useId(), notes: useId() }
  const gps = useGeolocation()
  const mapCenter = useMapStore((s) => s.view.center)
  const create = useJournalStore((s) => s.create)
  const select = useJournalStore((s) => s.select)

  const [time, setTime] = useState(() => toDatetimeLocal(Date.now()))
  const [shotChoice, setShotChoice] = useState<PositionChoice>(null)
  const [estimatedChoice, setEstimatedChoice] = useState<PositionChoice>(null)
  const [lastChoice, setLastChoice] = useState<PositionChoice>(null)
  const [reaction, setReaction] = useState('')
  const [direction, setDirection] = useState('')
  const [notes, setNotes] = useState('')
  const [link, setLink] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const gpsFix = gps.status === 'available' ? gps.value : null
  function resolve(choice: PositionChoice): Coordinate | null {
    // GPS is the default for the shot when a fix exists; the others stay empty
    // until chosen.
    if (choice === 'gps' && gpsFix) {
      return {
        lat: gpsFix.lat,
        lng: gpsFix.lng,
        ...(gpsFix.accuracyMeters !== undefined
          ? { accuracyMeters: gpsFix.accuracyMeters }
          : {}),
      }
    }
    if (choice === 'map-center') return { lat: mapCenter.lat, lng: mapCenter.lng }
    return null
  }
  const effectiveShotChoice: PositionChoice = shotChoice ?? (gpsFix ? 'gps' : null)
  const shotPosition = resolve(effectiveShotChoice)

  async function save() {
    const built = buildShotEntry({
      species,
      shotAtMs: fromDatetimeLocal(time),
      position: shotPosition,
      positionOrigin: effectiveShotChoice === 'gps' ? 'gps' : 'manual',
      reaction,
      fleeDirection: direction,
      estimated: resolve(estimatedChoice),
      lastConfirmed: resolve(lastChoice),
      notes,
      ...(link && openSessionId ? { searchSessionId: openSessionId } : {}),
    })
    if (!built.ok) {
      setError(built.message)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const saved = await create({
        coordinate: built.coordinate,
        notes: built.notes,
        observedAt: built.timestamp,
        positionOrigin: effectiveShotChoice === 'gps' ? 'gps' : 'manual',
        shot: built.shot,
      })
      select(null)
      onSaved(saved.id)
    } catch {
      setError(
        'Le tir n’a pas pu être enregistré sur cet appareil. Rien n’est perdu : réessayez.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      aria-label="Consigner le tir"
      className="border-surface-700 bg-surface-900 flex flex-col gap-4 rounded-lg border p-3"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <h2 className="text-ink-100 text-sm font-semibold">
        Consigner le tir — {SHOT_SPECIES_LABEL[species]}
      </h2>

      <Field label="Position du tir (là où vous étiez)">
        <PositionPicker
          label="Origine de la position du tir"
          choice={effectiveShotChoice}
          onChoice={setShotChoice}
          gpsFix={gpsFix !== null}
          position={shotPosition}
        />
      </Field>

      <Field label="Date et heure du tir" htmlFor={ids.time}>
        <input
          id={ids.time}
          type="datetime-local"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className={INPUT_CLASS}
        />
      </Field>

      <Field
        label="Réaction observée (vos mots)"
        htmlFor={ids.reaction}
        hint="Seulement ce que vous avez vu. L’application n’en tire aucune conclusion."
      >
        <textarea
          id={ids.reaction}
          value={reaction}
          onChange={(e) => setReaction(e.target.value.slice(0, 500))}
          rows={2}
          className={`${INPUT_CLASS} py-2`}
        />
      </Field>

      <Field
        label="Direction de fuite observée"
        hint="Seulement si vous avez vu l’animal partir : direction vers laquelle il allait."
      >
        <select
          aria-label="Direction de fuite observée"
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

      <Field
        label="Position estimée de l’animal (estimation manuelle)"
        hint="Votre propre estimation, saisie à la main. Ce n’est pas la position réelle de l’animal."
      >
        <PositionPicker
          label="Origine de la position estimée"
          choice={estimatedChoice}
          onChoice={setEstimatedChoice}
          gpsFix={gpsFix !== null}
          position={resolve(estimatedChoice)}
          optional
        />
      </Field>

      <Field
        label="Dernière position confirmée"
        hint="Là où vous avez confirmé voir l’animal ou un indice sûr."
      >
        <PositionPicker
          label="Origine de la dernière position confirmée"
          choice={lastChoice}
          onChoice={setLastChoice}
          gpsFix={gpsFix !== null}
          position={resolve(lastChoice)}
          optional
        />
      </Field>

      <Field label="Notes" htmlFor={ids.notes}>
        <textarea
          id={ids.notes}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={`${INPUT_CLASS} py-2`}
        />
      </Field>

      {openSessionId && (
        <label className="text-ink-100 flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={link}
            onChange={(e) => setLink(e.target.checked)}
            className="h-5 w-5"
          />
          Rattacher à la recherche de sang ouverte
        </label>
      )}

      {error && (
        <p role="alert" className="text-status-danger text-sm">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" size="lg" disabled={saving}>
          Enregistrer le tir
        </Button>
        <Button type="button" variant="secondary" size="lg" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  )
}
