import { useEffect, useState } from 'react'
import { Pause, Play, Square } from 'lucide-react'
import { formatDistanceMeters, formatDuration } from '@/utils/format'
import { useTracksStore } from '../state/tracksStore'

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

/** Floating start/pause/resume/stop control for GPS track recording,
 * opposite side from `WaypointControl` so the two are never stacked. */
export function TrackRecorderControl() {
  const status = useTracksStore((state) => state.status)
  const distanceMeters = useTracksStore((state) => state.distanceMeters)
  const recordingStartedAt = useTracksStore((state) => state.recordingStartedAt)
  const start = useTracksStore((state) => state.start)
  const pause = useTracksStore((state) => state.pause)
  const resume = useTracksStore((state) => state.resume)
  const stop = useTracksStore((state) => state.stop)

  if (status === 'idle' || !recordingStartedAt) {
    return (
      <button
        type="button"
        onClick={() => void start()}
        title="Record a GPS track"
        aria-label="Record a GPS track"
        className="border-surface-600 bg-surface-900/90 text-brand-400 hover:bg-surface-800 absolute top-56 right-3 z-10 rounded-lg border p-2.5 shadow-lg backdrop-blur-sm transition-colors"
      >
        <Play size={18} aria-hidden="true" />
      </button>
    )
  }

  return (
    <div className="border-surface-600 bg-surface-900/95 text-ink-100 absolute top-14 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-lg border px-3 py-2 text-sm shadow-lg">
      <span className={status === 'paused' ? 'text-ink-500' : 'text-status-danger'}>
        {status === 'paused' ? 'Paused' : '● Recording'}
      </span>
      <ElapsedTime startedAtIso={recordingStartedAt} />
      <span className="text-ink-300 tabular-nums">{formatDistanceMeters(distanceMeters)}</span>
      {status === 'recording' ? (
        <button
          type="button"
          onClick={pause}
          aria-label="Pause recording"
          className="text-ink-300 hover:text-ink-100"
        >
          <Pause size={16} aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          onClick={resume}
          aria-label="Resume recording"
          className="text-ink-300 hover:text-ink-100"
        >
          <Play size={16} aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        onClick={() => void stop()}
        aria-label="Stop and save track"
        className="text-status-danger hover:brightness-110"
      >
        <Square size={16} aria-hidden="true" />
      </button>
    </div>
  )
}
