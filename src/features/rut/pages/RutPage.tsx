import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { zonedDateKey } from '@/features/hunting-hours/zonedTime'
import { useJournalStore } from '@/features/journal/state/journalStore'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { RutReport } from '../RutReport'
import { summarizeObservations } from '../observationsSummary'

/** Québec calendar; the biological calendar is not shifted by the GPS position. */
const TIME_ZONE = 'America/Toronto'

export default function RutPage() {
  const observations = useJournalStore((s) => s.observations)
  const loaded = useJournalStore((s) => s.loaded)
  const load = useJournalStore((s) => s.load)
  const tracks = useTracksStore((s) => s.tracks)
  const tracksLoaded = useTracksStore((s) => s.loaded)
  const loadTracks = useTracksStore((s) => s.load)
  const [today] = useState(() => zonedDateKey(new Date(), TIME_ZONE))

  useEffect(() => {
    if (!loaded) void load()
    if (!tracksLoaded) void loadTracks()
  }, [loaded, load, tracksLoaded, loadTracks])

  const summary = useMemo(
    () => summarizeObservations(observations, tracks, { timeZone: TIME_ZONE }),
    [observations, tracks],
  )

  return (
    <div className="mx-auto max-w-xl space-y-3 p-3">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link to="/hunt" className="min-h-11 py-3 text-sm text-sky-300 underline">
          Où et quand chasser
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="min-h-11 rounded border border-slate-600 px-3 text-sm"
        >
          Enregistrer en PDF / imprimer
        </button>
      </div>
      <RutReport dateKey={today} summary={summary} />
    </div>
  )
}
