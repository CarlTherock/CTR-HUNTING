import { useEffect, useRef } from 'react'
import { Camera, Droplets, MapPin, Plus, Crosshair, X } from 'lucide-react'
import { ToolSlot } from '@/components/map-tools'
import { Button } from '@/components/ui'
import { QUICK_MARKER_KINDS, BLOOD_MARKER_LABEL } from '@/features/blood/sessionLogic'
import { useBloodStore } from '@/features/blood/state/bloodStore'
import type { GeolocationReading } from '@/features/gps/useGeolocation'
import { useGpsClock } from '@/features/gps/useGpsClock'
import { cn } from '@/utils/cn'
import {
  ADD_POINT_TYPES,
  ANIMAL_KINDS,
  describeGps,
  type AddPointType,
} from '../addPointLogic'
import { useAddPointStore } from '../state/addPointStore'

export interface AddPointControlProps {
  gpsReading: GeolocationReading
  /** Field Mode: oversized touch target. */
  large?: boolean
}

const CHIP =
  'min-h-11 rounded-lg border px-3 text-sm font-medium transition-colors text-left'

/** Permanent labelled « + Repère » button, its type/position panel, and the
 * banners that follow (waiting for a tap on the map, result of a save). */
export function AddPointControl({ gpsReading, large }: AddPointControlProps) {
  const open = useAddPointStore((s) => s.open)
  const picking = useAddPointStore((s) => s.picking)
  const notice = useAddPointStore((s) => s.notice)

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => useAddPointStore.getState().clearNotice(), 7000)
    return () => clearTimeout(timer)
  }, [notice])

  return (
    <>
      <ToolSlot placement="rail" order={-10}>
        <button
          type="button"
          onClick={() => useAddPointStore.getState().openSheet()}
          aria-label="Ajouter un repère"
          aria-haspopup="dialog"
          aria-expanded={open}
          data-testid="add-point-button"
          className={cn(
            'bg-brand-500 text-surface-950 hover:bg-brand-400 flex items-center justify-center gap-1.5 rounded-full font-bold shadow-lg outline outline-2 outline-white/70',
            large ? 'min-h-16 px-5 text-lg' : 'min-h-11 px-4 text-sm',
          )}
        >
          <Plus size={large ? 26 : 18} aria-hidden="true" />
          Repère
        </button>
      </ToolSlot>
      {open && <AddPointSheet gpsReading={gpsReading} />}
      {picking && (
        <div
          role="status"
          className="border-brand-500/40 bg-surface-900/95 text-ink-100 absolute top-3 left-1/2 z-20 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg"
        >
          Touchez la carte : place de l’observation{' '}
          {picking.species === 'deer' ? 'cerf' : 'orignal'}
          <button
            type="button"
            onClick={() => useAddPointStore.getState().cancelPicking()}
            aria-label="Annuler le placement de l’observation"
            className="text-ink-500 hover:text-ink-100 flex min-h-11 min-w-11 items-center justify-center"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
      {notice && !open && (
        <p
          role="status"
          data-testid="add-point-notice"
          className="border-surface-600 bg-surface-900/95 text-ink-100 absolute top-14 left-1/2 z-20 max-w-[calc(100%-1rem)] -translate-x-1/2 rounded-lg border px-3 py-2 text-xs shadow-lg"
        >
          {notice}
        </p>
      )}
    </>
  )
}

function actionLabel(type: AddPointType, mode: 'gps' | 'map', pressed: boolean): string {
  if (type === 'camera') return 'Ouvrir la caméra sang'
  if (mode === 'map' && !pressed) return 'Choisir sur la carte'
  switch (type) {
    case 'normal':
      return 'Créer le repère ici'
    case 'blood':
      return 'Enregistrer l’indice ici'
    default:
      return 'Enregistrer l’observation ici'
  }
}

function AddPointSheet({ gpsReading }: { gpsReading: GeolocationReading }) {
  const type = useAddPointStore((s) => s.type)
  const mode = useAddPointStore((s) => s.mode)
  const bloodKind = useAddPointStore((s) => s.bloodKind)
  const note = useAddPointStore((s) => s.note)
  const animal = useAddPointStore((s) => s.animal)
  const pressed = useAddPointStore((s) => s.pressed)
  const error = useAddPointStore((s) => s.error)
  const needsSearch = useAddPointStore((s) => s.needsSearch)
  const hasSearch = useBloodStore((s) => s.sessions.some((x) => x.status !== 'finished'))
  const now = useGpsClock(2000)
  const gps = describeGps(gpsReading, now)
  const panelRef = useRef<HTMLDivElement>(null)
  const store = useAddPointStore.getState

  useEffect(() => {
    panelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') store().closeSheet()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [store])

  const isAnimal = type === 'deer' || type === 'moose'

  return (
    <>
      <div
        className="absolute inset-0 z-30 bg-black/40"
        aria-hidden="true"
        onClick={() => store().closeSheet()}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Ajouter un repère"
        tabIndex={-1}
        data-testid="add-point-sheet"
        className="border-surface-600 bg-surface-900 text-ink-100 absolute inset-x-0 bottom-0 z-40 max-h-[80%] overflow-y-auto rounded-t-xl border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl outline-none"
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Ajouter à la carte</h2>
          <button
            type="button"
            onClick={() => store().closeSheet()}
            aria-label="Fermer l’ajout de repère"
            className="text-ink-300 hover:text-ink-100 flex h-11 w-11 items-center justify-center rounded-lg"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div
          role="radiogroup"
          aria-label="Type de repère"
          className="grid grid-cols-2 gap-2 min-[700px]:grid-cols-5"
        >
          {ADD_POINT_TYPES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="radio"
              aria-checked={type === entry.id}
              onClick={() => store().setType(entry.id)}
              className={cn(
                CHIP,
                type === entry.id
                  ? 'border-brand-400 bg-brand-500/15 text-brand-400'
                  : 'border-surface-600 hover:bg-surface-800',
              )}
            >
              <span className="flex items-center gap-1.5">
                {entry.id === 'blood' && (
                  <Droplets size={15} className="text-[#dc2626]" aria-hidden="true" />
                )}
                {entry.id === 'camera' && <Camera size={15} aria-hidden="true" />}
                {entry.id !== 'blood' && entry.id !== 'camera' && (
                  <MapPin size={15} aria-hidden="true" />
                )}
                {entry.label}
              </span>
              <span className="text-ink-500 block text-[11px] font-normal">
                {entry.hint}
              </span>
            </button>
          ))}
        </div>

        {type !== 'camera' && (
          <fieldset className="mt-3">
            <legend className="text-ink-300 mb-1 text-xs font-semibold">Position</legend>
            <div
              role="radiogroup"
              aria-label="Mode de position"
              className="grid grid-cols-2 gap-2"
            >
              <button
                type="button"
                role="radio"
                aria-checked={mode === 'gps'}
                onClick={() => store().setMode('gps')}
                className={cn(
                  CHIP,
                  mode === 'gps'
                    ? 'border-brand-400 bg-brand-500/15 text-brand-400'
                    : 'border-surface-600 hover:bg-surface-800',
                )}
              >
                <span className="flex items-center gap-1.5">
                  <Crosshair size={15} aria-hidden="true" /> Ma position GPS
                </span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mode === 'map'}
                onClick={() => store().setMode('map')}
                className={cn(
                  CHIP,
                  mode === 'map'
                    ? 'border-brand-400 bg-brand-500/15 text-brand-400'
                    : 'border-surface-600 hover:bg-surface-800',
                )}
              >
                Position sur la carte
              </button>
            </div>
            <p
              data-testid="add-point-gps-line"
              className={cn(
                'mt-1 text-xs',
                gps.usable ? 'text-ink-300' : 'text-status-warning',
              )}
            >
              {mode === 'gps'
                ? gps.line
                : pressed
                  ? `Point pressé sur la carte : ${pressed.lat.toFixed(5)}, ${pressed.lng.toFixed(5)}`
                  : 'Vous toucherez la carte pour choisir l’endroit. Aucune position n’est inventée.'}
            </p>
          </fieldset>
        )}

        {type === 'blood' && (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-ink-300 text-xs font-semibold">Type d’indice</p>
            <div className="flex flex-wrap gap-2">
              {(['blood', ...QUICK_MARKER_KINDS] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={bloodKind === kind}
                  onClick={() => store().setBloodKind(kind)}
                  className={cn(
                    CHIP,
                    bloodKind === kind
                      ? 'border-[#dc2626] bg-[#dc2626]/15'
                      : 'border-surface-600 hover:bg-surface-800',
                  )}
                >
                  {BLOOD_MARKER_LABEL[kind]}
                </button>
              ))}
            </div>
            {!hasSearch && !needsSearch && (
              <p className="text-ink-300 text-xs">
                Aucune recherche ouverte : un indice sang se rattache à une recherche.
                Vous choisirez à l’enregistrement.
              </p>
            )}
          </div>
        )}

        {isAnimal && (
          <div className="mt-3 flex flex-col gap-2">
            <label className="text-ink-300 flex flex-col gap-1 text-xs font-semibold">
              Ce que vous avez vu
              <select
                value={animal.kind}
                onChange={(e) =>
                  store().patchAnimal({ kind: e.target.value as typeof animal.kind })
                }
                className="border-surface-600 bg-surface-900 text-ink-100 min-h-11 rounded-lg border px-2 text-base font-normal"
              >
                {ANIMAL_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-ink-300 flex flex-col gap-1 text-xs font-semibold">
              Nombre (facultatif)
              <input
                inputMode="numeric"
                value={animal.count}
                onChange={(e) =>
                  store().patchAnimal({
                    count: e.target.value.replace(/\D/g, '').slice(0, 2),
                  })
                }
                className="border-surface-600 bg-surface-900 text-ink-100 min-h-11 rounded-lg border px-3 text-base font-normal"
              />
            </label>
            <p className="text-ink-500 text-[11px]">
              Observation notée à l’heure de l’enregistrement. Ce n’est que ce que vous
              saisissez : aucune identification ni prévision.
            </p>
          </div>
        )}

        {(type === 'blood' || isAnimal) && (
          <label className="text-ink-300 mt-3 flex flex-col gap-1 text-xs font-semibold">
            Note (facultative)
            <textarea
              value={note}
              onChange={(e) => store().setNote(e.target.value.slice(0, 500))}
              rows={2}
              className="border-surface-600 bg-surface-900 text-ink-100 rounded-lg border px-3 py-2 text-base font-normal"
            />
          </label>
        )}

        {type === 'normal' && (
          <p className="text-ink-500 mt-3 text-xs">
            Nom, icône, couleur, photo et notes se règlent juste après, dans la fiche du
            repère.
          </p>
        )}
        {type === 'camera' && (
          <p className="text-ink-300 mt-3 text-xs">
            Aide visuelle expérimentale : elle surligne des zones de couleur candidates,
            avec des faux positifs possibles, et ne confirme jamais du sang. Elle s’ouvre
            sans recherche en cours.
          </p>
        )}

        {error && (
          <p role="alert" className="text-status-danger mt-2 text-xs">
            {error}
          </p>
        )}

        {needsSearch ? (
          <div
            role="alertdialog"
            aria-label="Aucune recherche de sang ouverte"
            className="border-surface-600 mt-3 flex flex-col gap-2 rounded-lg border p-2 text-sm"
          >
            <p>
              Aucune recherche de sang n’est ouverte. Créer une recherche démarre
              l’enregistrement de la trace rouge si le GPS est prêt ; rien ne démarre sans
              votre choix.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="md"
                onClick={() => void store().createSearchAndSubmit(gpsReading)}
              >
                Créer une recherche et enregistrer
              </Button>
              <Button variant="secondary" size="md" onClick={() => store().dismissGate()}>
                Annuler
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="primary"
            size="lg"
            className="mt-3 w-full"
            onClick={() => void store().submit(gpsReading)}
          >
            {actionLabel(type, mode, pressed !== null)}
          </Button>
        )}
      </div>
    </>
  )
}
