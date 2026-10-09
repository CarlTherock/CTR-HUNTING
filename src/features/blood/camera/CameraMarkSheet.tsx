import { useState } from 'react'
import { Droplets, MapPin } from 'lucide-react'
import { describeGps } from '@/features/addpoint/addPointLogic'
import type { GeolocationReading } from '@/features/gps/useGeolocation'
import { useGpsClock } from '@/features/gps/useGpsClock'
import { Button } from '@/components/ui'
import { cn } from '@/utils/cn'
import { useBloodStore } from '../state/bloodStore'
import { CameraSheet } from './CameraSheet'
import type { CameraClueFlow, ClueRequest, PendingCapture } from './useCameraClue'

export interface CameraMarkSheetProps {
  gpsReading: GeolocationReading
  flow: CameraClueFlow
  /** A capture kept from this camera session, offered (never forced). */
  kept: PendingCapture | null
  onClose: () => void
}

const TYPE_BUTTON =
  'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border px-2 text-sm'

/** « + Repère » from the camera. The point is the PHONE's position (GPS with
 * its accuracy and age) or a place chosen on the map — the camera cannot say
 * where the object in the image is. */
export function CameraMarkSheet({
  gpsReading,
  flow,
  kept,
  onClose,
}: CameraMarkSheetProps) {
  const [kind, setKind] = useState<ClueRequest['kind']>('blood')
  const [attach, setAttach] = useState(false)
  const [note, setNote] = useState('')
  const now = useGpsClock(2000)
  const gps = describeGps(gpsReading, now)
  const openSession = useBloodStore((state) =>
    state.sessions.find((session) => session.status !== 'finished'),
  )

  /** Switching type keeps the note and the choice of capture, and drops what
   * only concerned the previous type (search gate, map prompt, error). */
  function changeKind(next: ClueRequest['kind']) {
    if (next === kind) return
    setKind(next)
    flow.reset()
  }

  function submit() {
    flow.submit({ kind, note, photo: attach && kept ? kept : null })
  }

  const footer = (
    <div className="flex flex-col gap-2">
      <Button
        variant="primary"
        size="lg"
        disabled={flow.busy || !gps.usable}
        onClick={submit}
        data-testid="mark-save"
      >
        {kind === 'blood' ? 'Enregistrer l’indice ici' : 'Créer le repère ici'}
      </Button>
      <Button
        variant="secondary"
        size="md"
        disabled={flow.busy}
        onClick={() =>
          flow.submit({ kind, note, photo: attach && kept ? kept : null, map: true })
        }
      >
        <MapPin size={16} aria-hidden="true" /> Placer sur la carte
      </Button>
    </div>
  )

  return (
    <CameraSheet
      label="Ajouter un repère depuis la caméra"
      title="+ Repère"
      onClose={onClose}
      testId="camera-mark"
      footer={footer}
    >
      <div role="group" aria-label="Type de repère" className="flex gap-2">
        <button
          type="button"
          aria-pressed={kind === 'blood'}
          onClick={() => changeKind('blood')}
          className={cn(
            TYPE_BUTTON,
            kind === 'blood' ? 'border-red-400 bg-red-500/15' : 'border-surface-600',
          )}
        >
          <Droplets size={16} className="text-red-500" aria-hidden="true" /> Sang / indice
        </button>
        <button
          type="button"
          aria-pressed={kind === 'normal'}
          onClick={() => changeKind('normal')}
          className={cn(
            TYPE_BUTTON,
            kind === 'normal' ? 'border-brand-400 bg-brand-500/15' : 'border-surface-600',
          )}
        >
          Repère normal
        </button>
      </div>

      <p
        data-testid="mark-gps"
        className={cn('text-sm', !gps.usable && 'text-amber-300')}
      >
        {gps.usable ? `Position du téléphone : ${gps.line}` : gps.line}
      </p>
      <p className="text-ink-300 text-xs">
        Le point sera placé à la position du téléphone, pas à l’endroit exact de la tache
        ni du centre de l’image : la caméra ne localise pas ce qu’elle montre.
        {gps.usable
          ? ''
          : ' Sans position GPS récente, choisissez « Placer sur la carte ».'}
      </p>
      {kind === 'blood' && openSession && (
        <p className="text-xs" data-testid="mark-target">
          Sera rattaché à la recherche : <strong>{openSession.name}</strong>
        </p>
      )}

      {kept && (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={attach}
            onChange={(event) => setAttach(event.target.checked)}
            className="h-5 w-5"
          />
          Joindre la capture que je viens de prendre
        </label>
      )}

      <label className="text-xs">
        Note (facultative)
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          className="border-surface-600 bg-surface-900 mt-1 w-full rounded-lg border p-2 text-base"
        />
      </label>

      {flow.gate && (
        <div
          role="group"
          aria-label="Aucune recherche ouverte"
          data-testid="clue-gate"
          className="border-surface-600 flex flex-col gap-2 rounded-lg border p-2 text-sm"
        >
          <p>
            Aucune recherche de sang n’est ouverte. Un indice doit être rattaché à une
            recherche. Créer une recherche démarre aussi l’enregistrement de votre trace
            GPS (ou l’attend si le GPS n’est pas prêt).
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="md"
              disabled={flow.busy}
              onClick={() => void flow.createSearchAndContinue()}
            >
              Créer une recherche et démarrer ma trace
            </Button>
            <Button variant="secondary" size="md" onClick={flow.dismissGate}>
              Annuler
            </Button>
          </div>
        </div>
      )}
      {flow.needsMap && (
        <p role="status" className="text-sm text-amber-300">
          Position GPS indisponible ou trop ancienne : placez le point à la main sur la
          carte (ce ne sera pas la position du téléphone).
        </p>
      )}
      {flow.error && (
        <p role="alert" className="text-status-danger text-sm">
          {flow.error}
        </p>
      )}
    </CameraSheet>
  )
}
