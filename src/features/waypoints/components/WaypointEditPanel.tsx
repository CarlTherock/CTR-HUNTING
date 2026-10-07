import { useState } from 'react'
import { Lock, MapPin, Save, Trash2, Wind, X } from 'lucide-react'
import { Button } from '@/components/ui'
import { useWindStore } from '@/features/wind/state/windStore'
import { cn } from '@/utils/cn'
import { compassLabel } from '@/utils/terrain'
import { isOptimalWind } from '@/utils/windField'
import { WindCompass } from '@/features/wind/components/WindCompass'
import type { WaypointCategory, WaypointColor } from '@/types'
import {
  CATEGORY_OPTIONS,
  COLOR_OPTIONS,
  DEFAULT_WAYPOINT_COLOR as DEFAULT_COLOR,
} from '../categories'
import { useWaypointsStore } from '../state/waypointsStore'
import { WaypointPhotos } from './WaypointPhotos'

/** Stable ref callback: moves focus into the confirmation dialog when it opens. */
function focusOnMount(element: HTMLDivElement | null) {
  element?.focus()
}

/** The 8 compass octants a hunter can mark as "good wind" for a spot —
 * matches `octantOf()` in `utils/windField.ts`, which snaps any live
 * reading to the nearest of these same 8 values before comparing. */
const OCTANTS = [0, 45, 90, 135, 180, 225, 270, 315]

const FIELD =
  'border-surface-600 bg-surface-800 text-ink-100 focus-visible:outline-brand-400 min-h-11 rounded-md border px-3 text-base outline-none focus-visible:outline-2'

function formatCoordinate(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

/**
 * Bottom sheet for a waypoint, in two clearly different modes:
 *
 *  - **creation** (a draft that exists only in memory): first a compact bar
 *    to adjust the position on the map (tap the map or drag the dashed
 *    marker), then the details form. "Enregistrer" writes the waypoint and
 *    locks its position; "Annuler" leaves nothing behind; a failed write
 *    keeps everything open with the error shown.
 *  - **edition** (a saved waypoint): name, category, colour, notes, photos
 *    and wind preferences are editable; the position is shown read-only and
 *    cannot be changed — to move a spot, delete it and create a new one.
 */
export function WaypointEditPanel() {
  const editingId = useWaypointsStore((state) => state.editingId)
  const draft = useWaypointsStore((state) => state.draft)
  const waypoint = useWaypointsStore((state) =>
    state.waypoints.find((w) => w.id === state.editingId),
  )
  const updateWaypoint = useWaypointsStore((state) => state.updateWaypoint)
  const saveDraft = useWaypointsStore((state) => state.saveDraft)
  const cancelDraft = useWaypointsStore((state) => state.cancelDraft)
  const deleteWaypoint = useWaypointsStore((state) => state.deleteWaypoint)
  const closeEdit = useWaypointsStore((state) => state.closeEdit)

  const target = draft ? 'draft' : (waypoint?.id ?? null)
  const [name, setName] = useState(waypoint?.name ?? '')
  const [category, setCategory] = useState<WaypointCategory>(
    waypoint?.category ?? 'general',
  )
  const [color, setColor] = useState<WaypointColor>(waypoint?.color ?? DEFAULT_COLOR)
  const [notes, setNotes] = useState(waypoint?.notes ?? '')
  const [optimalWindDirections, setOptimalWindDirections] = useState<number[]>(
    waypoint?.optimalWindDirections ?? [],
  )
  const [openedFor, setOpenedFor] = useState<string | null>(target)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const position = draft?.coordinate ?? waypoint?.coordinate ?? null
  const windAt = useWindStore((state) => state.windAt)
  const windEnabled = useWindStore((state) => state.enabled)
  const currentWind = windEnabled && position ? windAt(position) : null

  // Re-seed the form when a different waypoint (or a new draft) is opened —
  // but not on every store update, or edits in progress would be clobbered.
  if (openedFor !== target) {
    setOpenedFor(target)
    setName(waypoint?.name ?? '')
    setCategory(waypoint?.category ?? 'general')
    setColor(waypoint?.color ?? DEFAULT_COLOR)
    setNotes(waypoint?.notes ?? '')
    setOptimalWindDirections(waypoint?.optimalWindDirections ?? [])
    setDetailsOpen(false)
    setConfirmingDelete(false)
    setError(null)
  }

  if (!draft && !(editingId && waypoint)) return null
  if (!position) return null

  function toggleOctant(octant: number) {
    setOptimalWindDirections((current) =>
      current.includes(octant)
        ? current.filter((o) => o !== octant)
        : [...current, octant],
    )
  }

  async function handleSave() {
    setError(null)
    if (draft) {
      await saveDraft({ name, category, color, notes, optimalWindDirections })
      return
    }
    if (!editingId) return
    setSaving(true)
    try {
      await updateWaypoint(editingId, {
        name: name.trim() || 'Point de repère',
        category,
        color,
        notes,
        optimalWindDirections,
      })
      closeEdit()
    } catch {
      setError(
        'Enregistrement impossible : l’écriture sur l’appareil a échoué. Réessayez.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!editingId) return
    setError(null)
    try {
      await deleteWaypoint(editingId)
    } catch {
      setError('Suppression impossible : l’écriture sur l’appareil a échoué.')
    }
  }

  const shell =
    'fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]'
  const card =
    'border-surface-600 bg-surface-900 max-h-[80dvh] w-full max-w-sm overflow-y-auto rounded-lg border p-4 shadow-2xl'
  const draftError = draft?.error ?? null
  const shownError = error ?? draftError
  const busy = saving || (draft?.saving ?? false)

  // Step 1 of a creation: keep the map visible so the position can be adjusted.
  if (draft && !detailsOpen) {
    return (
      <div className={shell}>
        <div
          className={card}
          role="region"
          aria-label="Position du nouveau point de repère"
        >
          <p className="text-ink-100 flex items-center gap-2 text-sm font-semibold">
            <MapPin size={16} aria-hidden="true" />
            Nouveau point de repère
          </p>
          <p className="text-ink-300 mt-1 text-sm tabular-nums">
            {formatCoordinate(position.lat, position.lng)}
          </p>
          <p className="text-ink-500 mt-1 text-xs">
            Ajustez la position : touchez la carte ou faites glisser le repère en
            pointillés. Elle sera verrouillée à l’enregistrement.
          </p>
          <div className="mt-3 flex items-center justify-between gap-2">
            <Button variant="secondary" size="md" onClick={cancelDraft}>
              Annuler
            </Button>
            <Button variant="primary" size="md" onClick={() => setDetailsOpen(true)}>
              Continuer
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={shell}>
      <div className={card}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-ink-100 text-sm font-semibold">
            {draft ? 'Nouveau point de repère' : 'Point de repère'}
          </h2>
          <button
            type="button"
            onClick={draft ? () => setDetailsOpen(false) : closeEdit}
            aria-label={
              draft ? 'Retour à l’ajustement de la position' : 'Fermer sans enregistrer'
            }
            className="text-ink-500 hover:text-ink-100 flex h-11 w-11 items-center justify-center"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div className="bg-surface-800 text-ink-300 flex items-start gap-2 rounded-md p-2 text-xs">
            <Lock size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
            <div>
              <p className="text-ink-100 tabular-nums">
                {formatCoordinate(position.lat, position.lng)}
              </p>
              <p>
                {draft
                  ? 'La position sera verrouillée à l’enregistrement.'
                  : 'Position verrouillée. Pour la changer, supprimez ce point et créez-en un nouveau.'}
              </p>
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-ink-500 text-xs font-medium">Nom</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              className={FIELD}
            />
          </label>

          <div>
            <span className="text-ink-500 text-xs font-medium">Catégorie</span>
            <div
              role="radiogroup"
              aria-label="Catégorie"
              className="mt-1.5 grid grid-cols-3 gap-1.5"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={category === option.value}
                  title={option.label}
                  onClick={() => setCategory(option.value)}
                  className={cn(
                    'flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-1 py-2 text-center transition-colors',
                    category === option.value
                      ? 'bg-brand-500/15 text-brand-400'
                      : 'text-ink-300 hover:bg-surface-800',
                  )}
                >
                  <option.Icon size={16} aria-hidden="true" />
                  <span className="text-[11px] leading-tight">{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-ink-500 text-xs font-medium">Couleur</span>
            <div
              role="radiogroup"
              aria-label="Couleur"
              className="mt-1.5 flex flex-wrap gap-1"
            >
              {COLOR_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={color === option.value}
                  title={option.label}
                  aria-label={option.label}
                  onClick={() => setColor(option.value)}
                  className="flex h-11 w-11 items-center justify-center"
                >
                  <span
                    style={{ background: option.value }}
                    className={cn(
                      'h-7 w-7 rounded-full ring-offset-2 ring-offset-[var(--color-surface-900)] transition-shadow',
                      color === option.value ? 'ring-2 ring-white' : '',
                    )}
                  />
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-ink-500 text-xs font-medium">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={cn(FIELD, 'resize-none py-2')}
            />
          </label>

          <div>
            <div className="flex items-center justify-between">
              <span className="text-ink-500 text-xs font-medium">
                Vent favorable (provenance)
              </span>
              {currentWind && (
                <span
                  className={cn(
                    'flex items-center gap-1 text-[11px] font-medium',
                    isOptimalWind(currentWind.directionDegrees, optimalWindDirections)
                      ? 'text-status-success'
                      : optimalWindDirections.length > 0
                        ? 'text-status-danger'
                        : 'text-ink-500',
                  )}
                >
                  <Wind size={11} aria-hidden="true" />
                  {compassLabel(currentWind.directionDegrees)} maintenant
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-3">
              {currentWind && (
                <WindCompass
                  directionDegrees={currentWind.directionDegrees}
                  speedKmh={currentWind.speedKmh}
                  optimalDirections={optimalWindDirections}
                  size={100}
                />
              )}
              <div
                role="group"
                aria-label="Directions de vent favorables"
                className="grid flex-1 grid-cols-4 gap-1.5"
              >
                {OCTANTS.map((octant) => (
                  <button
                    key={octant}
                    type="button"
                    aria-pressed={optimalWindDirections.includes(octant)}
                    onClick={() => toggleOctant(octant)}
                    className={cn(
                      'min-h-11 rounded-md px-1 text-center text-sm font-medium transition-colors',
                      optimalWindDirections.includes(octant)
                        ? 'bg-brand-500/15 text-brand-400'
                        : 'text-ink-300 hover:bg-surface-800',
                    )}
                  >
                    {compassLabel(octant)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {waypoint && !draft ? (
            <WaypointPhotos waypointId={waypoint.id} photoIds={waypoint.photoIds ?? []} />
          ) : (
            <p className="text-ink-500 text-xs">
              Les photos pourront être ajoutées une fois le point enregistré.
            </p>
          )}
        </div>

        {shownError && (
          <p role="alert" className="text-status-danger mt-3 text-sm">
            {shownError}
          </p>
        )}

        {confirmingDelete && waypoint ? (
          <div
            ref={focusOnMount}
            tabIndex={-1}
            role="alertdialog"
            aria-label={`Confirmer la suppression de ${waypoint.name}`}
            className="border-status-danger/50 mt-4 flex flex-col gap-2 rounded-lg border p-3 text-sm outline-none"
          >
            <p className="text-ink-100">
              Supprimer définitivement « {waypoint.name} » et ses photos ? Cette action
              est irréversible.
            </p>
            <div className="flex justify-between gap-2">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setConfirmingDelete(false)}
              >
                Annuler
              </Button>
              <Button variant="danger" size="md" onClick={() => void handleDelete()}>
                <Trash2 size={14} aria-hidden="true" />
                Supprimer
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex items-center justify-between gap-2">
            {draft ? (
              <Button variant="secondary" size="md" onClick={cancelDraft} disabled={busy}>
                Annuler
              </Button>
            ) : (
              <Button
                variant="danger"
                size="md"
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 size={14} aria-hidden="true" />
                Supprimer
              </Button>
            )}
            <Button
              variant="primary"
              size="md"
              onClick={() => void handleSave()}
              disabled={busy}
            >
              <Save size={14} aria-hidden="true" />
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
