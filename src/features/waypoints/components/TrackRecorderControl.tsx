import { useEffect, useState } from 'react'
import { AlertTriangle, Pause, Play, Square } from 'lucide-react'
import { formatDistanceMeters, formatDuration } from '@/utils/format'
import { ToolTrigger } from '@/components/map-tools'
import { useTracksStore } from '../state/tracksStore'
import { useRecordingWakeLock } from '../useRecordingWakeLock'

/** Ticks every second while mounted, showing elapsed time since
 * `startedAtIso`. A separate component (not inline state in
 * `TrackRecorderControl`) so `Date.now()` is only ever read from inside
 * the interval's own callback — a plain effect subscription, not a
 * synchronous `setState` call in the effect body, which React's rules
 * discourage (it can cause cascading renders). Re-subscribes whenever
 * `startedAtIso` changes (a new recording started). */
function ElapsedTime({ startedAtIso }: { startedAtIso: string }) {
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    const startedAtMs = new Date(startedAtIso).getTime()
    const id = setInterval(() => setElapsedMs(Date.now() - startedAtMs), 1000)
    return () => clearInterval(id)
  }, [startedAtIso])

  return <span className="text-ink-300 tabular-nums">{formatDuration(elapsedMs)}</span>
}

const ICON_BUTTON =
  'flex h-11 w-11 items-center justify-center rounded-lg hover:bg-surface-800'

/** Start/pause/resume/stop control for GPS track recording. The start
 * button lives in the "Outils" sheet; while recording, a banner at the top
 * of the map shows the live state, any failure to save to the device, and
 * whether the screen is being kept awake. */
export function TrackRecorderControl() {
  const status = useTracksStore((state) => state.status)
  const distanceMeters = useTracksStore((state) => state.distanceMeters)
  const recordingStartedAt = useTracksStore((state) => state.recordingStartedAt)
  const persistError = useTracksStore((state) => state.persistError)
  const start = useTracksStore((state) => state.start)
  const pause = useTracksStore((state) => state.pause)
  const resume = useTracksStore((state) => state.resume)
  const stop = useTracksStore((state) => state.stop)
  const flush = useTracksStore((state) => state.flush)
  const wakeLock = useRecordingWakeLock(status === 'recording')
  const recording = status !== 'idle' && recordingStartedAt !== null

  // Save immediately when the page is about to be hidden or closed: on iPhone
  // this is the last chance before the system may suspend the page.
  useEffect(() => {
    if (!recording) return
    function onHidden() {
      if (document.visibilityState === 'hidden') void flush()
    }
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', onHidden)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', onHidden)
    }
  }, [recording, flush])

  if (!recording) {
    return (
      <>
        <ToolTrigger
          label="Enregistrer une trace GPS"
          icon={<Play size={18} aria-hidden="true" />}
          onClick={() => void start()}
          order={10}
        />
        {persistError && (
          <p
            role="alert"
            className="border-status-danger/50 bg-surface-900/95 text-status-danger absolute top-12 left-1/2 z-20 w-[min(22rem,calc(100%-1rem))] -translate-x-1/2 rounded-lg border px-3 py-2 text-sm shadow-lg"
          >
            {persistError}
          </p>
        )}
      </>
    )
  }

  return (
    <div className="absolute top-12 left-1/2 z-20 flex w-[min(24rem,calc(100%-1rem))] -translate-x-1/2 flex-col gap-1">
      <div className="border-surface-600 bg-surface-900/95 text-ink-100 flex items-center justify-between gap-2 rounded-lg border px-3 py-1 text-sm shadow-lg">
        <span className={status === 'paused' ? 'text-ink-500' : 'text-status-danger'}>
          {status === 'paused' ? 'En pause' : '● Enregistrement'}
        </span>
        <ElapsedTime startedAtIso={recordingStartedAt} />
        <span className="text-ink-300 tabular-nums">{formatDistanceMeters(distanceMeters)}</span>
        {status === 'recording' ? (
          <button
            type="button"
            onClick={pause}
            aria-label="Mettre l’enregistrement en pause"
            className={`${ICON_BUTTON} text-ink-300`}
          >
            <Pause size={18} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={resume}
            aria-label="Reprendre l’enregistrement"
            className={`${ICON_BUTTON} text-ink-300`}
          >
            <Play size={18} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={() => void stop()}
          aria-label="Arrêter et enregistrer la trace"
          className={`${ICON_BUTTON} text-status-danger`}
        >
          <Square size={18} aria-hidden="true" />
        </button>
      </div>
      {persistError && (
        <p
          role="alert"
          className="border-status-danger/50 bg-surface-900/95 text-status-danger flex items-start gap-2 rounded-lg border px-3 py-2 text-xs shadow-lg"
        >
          <AlertTriangle size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
          {persistError}
        </p>
      )}
      <p className="bg-surface-900/90 text-ink-300 rounded-lg px-3 py-1 text-xs shadow-lg">
        {wakeLock === 'held'
          ? 'Écran maintenu allumé pendant l’enregistrement.'
          : 'Gardez l’application ouverte et l’écran allumé : sur iPhone, le GPS s’arrête quand l’écran se verrouille.'}
      </p>
    </div>
  )
}
