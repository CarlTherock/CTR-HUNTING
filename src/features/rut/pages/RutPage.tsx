import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { zonedDateKey } from '@/features/hunting-hours/zonedTime'
import { useJournalStore } from '@/features/journal/state/journalStore'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useHuntPresentationStore } from '@/features/deer-intel/state/presentationStore'
import { RutReport } from '../RutReport'
import { summarizeObservations } from '../observationsSummary'
const TIME_ZONE = 'America/Toronto'
/** Monté uniquement sur demande : aucune lecture locale dans le parcours par défaut. */
function ReportWithObservations({ dateKey }: { dateKey: string }) {
  const observations = useJournalStore((s) => s.observations)
  const loaded = useJournalStore((s) => s.loaded)
  const load = useJournalStore((s) => s.load)
  const tracks = useTracksStore((s) => s.tracks)
  const tracksLoaded = useTracksStore((s) => s.loaded)
  const loadTracks = useTracksStore((s) => s.load)
  useEffect(() => { if (!loaded) void load().catch(() => undefined); if (!tracksLoaded) void loadTracks().catch(() => undefined) }, [loaded, load, tracksLoaded, loadTracks])
  const summary = useMemo(() => summarizeObservations(observations, tracks, { timeZone: TIME_ZONE }), [observations, tracks])
  return <RutReport dateKey={dateKey} summary={summary}/>
}
export default function RutPage() {
  const selected = useHuntPresentationStore((s) => s.dateKey)
  const setDateKey = useHuntPresentationStore((s) => s.setDateKey)
  const [today] = useState(() => zonedDateKey(new Date(), TIME_ZONE))
  const [local, setLocal] = useState(false)
  const dateKey = selected ?? today
  const empty = useMemo(() => summarizeObservations([], [], { timeZone: TIME_ZONE }), [])
  return <div className="mx-auto max-w-3xl space-y-4 p-3"><div className="flex flex-wrap items-center justify-between gap-2 print:hidden"><Link to="/hunt" className="min-h-11 py-3 text-sm text-sky-300 underline">Où et quand chasser</Link><button type="button" onClick={() => window.print()} className="min-h-11 rounded-lg border border-slate-600 px-3 text-sm">Enregistrer en PDF / imprimer</button></div><label className="text-ink-200 flex min-h-11 flex-wrap items-center gap-3 text-sm print:hidden">Date consultée<input type="date" value={dateKey} onChange={(e) => { if (e.target.value) setDateKey(e.target.value) }} className="border-surface-600 bg-surface-900 min-h-11 rounded-lg border px-3"/></label><button type="button" aria-expanded={local} onClick={() => setLocal((v) => !v)} className="border-surface-600 text-ink-300 min-h-11 rounded-lg border px-3 text-sm print:hidden">{local ? 'Masquer mes observations facultatives' : 'Afficher mes observations facultatives'}</button>{local ? <ReportWithObservations dateKey={dateKey}/> : <RutReport dateKey={dateKey} summary={empty}/>}</div>
}
