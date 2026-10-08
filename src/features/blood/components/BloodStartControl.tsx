import { useState } from 'react'
import { Droplets } from 'lucide-react'
import { ToolTrigger } from '@/components/map-tools'
import { Button } from '@/components/ui'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import type { GeolocationReading } from '@/features/gps/useGeolocation'
import { isUsableForStart } from '../markerPosition'
import { useBloodStore } from '../state/bloodStore'

interface BloodStartControlProps {
  gpsReading: GeolocationReading
}

/** Starts a blood-search session from the tools sheet. When another trace is
 * already being recorded, nothing is started silently: the user chooses to
 * keep that trace or finish it first. */
export function BloodStartControl({ gpsReading }: BloodStartControlProps) {
  const session = useBloodStore((state) =>
    state.sessions.find((s) => s.status !== 'finished'),
  )
  const startSession = useBloodStore((state) => state.startSession)
  const trackStatus = useTracksStore((state) => state.status)
  const stopTrack = useTracksStore((state) => state.stop)
  const [message, setMessage] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)

  async function begin() {
    setMessage(null)
    const result = await startSession({
      hasUsableFix: isUsableForStart(gpsReading, Date.now()),
    })
    if (result.ok) {
      setConflict(false)
      return
    }
    if (result.reason === 'track-active') setConflict(true)
    setMessage(result.message)
  }

  async function finishThenBegin() {
    await stopTrack()
    await begin()
  }

  return (
    <>
      <ToolTrigger
        label="Démarrer une recherche de sang"
        icon={<Droplets size={18} aria-hidden="true" />}
        onClick={() => void begin()}
        disabled={Boolean(session)}
        order={9}
      />
      {(conflict || message) && trackStatus !== 'idle' && !session && (
        <div
          role="alertdialog"
          aria-label="Trace déjà en cours"
          className="border-surface-600 bg-surface-900 text-ink-100 pointer-events-auto absolute top-12 left-1/2 z-40 w-[min(24rem,calc(100%-1rem))] -translate-x-1/2 rounded-lg border p-3 text-sm shadow-xl"
        >
          <p>
            Une trace est déjà en cours d’enregistrement. Une seule trace est active à la
            fois : la trace en cours n’est pas convertie en recherche de sang.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="md" onClick={() => setConflict(false)}>
              Continuer la trace en cours
            </Button>
            <Button variant="primary" size="md" onClick={() => void finishThenBegin()}>
              Terminer la trace et démarrer la recherche
            </Button>
          </div>
        </div>
      )}
      {message && !conflict && (
        <p
          role="alert"
          className="text-status-danger absolute top-12 left-1/2 z-40 -translate-x-1/2 text-xs"
        >
          {message}
        </p>
      )}
    </>
  )
}
