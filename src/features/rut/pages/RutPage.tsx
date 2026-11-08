import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { zonedDateKey } from '@/features/hunting-hours/zonedTime'
import { useJournalStore } from '@/features/journal/state/journalStore'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useHuntPresentationStore } from '@/features/deer-intel/state/presentationStore'
import { useHuntStore } from '@/features/deer-intel/state/huntStore'
import { resolveTimeZone } from '../territory'
import { RutLocationPanel } from '../RutLocationPanel'
import { RutReport } from '../RutReport'
import { summarizeObservations } from '../observationsSummary'
function ReportWithObservations({ dateKey, timeZone }: { dateKey: string; timeZone: string }) {
  const observations = useJournalStore((s) => s.observations), loaded = useJournalStore((s) => s.loaded), load = useJournalStore((s) => s.load)
  const tracks = useTracksStore((s) => s.tracks), tracksLoaded = useTracksStore((s) => s.loaded), loadTracks = useTracksStore((s) => s.load)
  useEffect(() => { if (!loaded) void load().catch(() => undefined); if (!tracksLoaded) void loadTracks().catch(() => undefined) }, [loaded, load, tracksLoaded, loadTracks])
  const summary = useMemo(() => summarizeObservations(observations, tracks, { timeZone }), [observations, tracks, timeZone])
  return <RutReport dateKey={dateKey} summary={summary}/>
}
export default function RutPage() {
  const selected = useHuntPresentationStore((s) => s.dateKey), setDateKey = useHuntPresentationStore((s) => s.setDateKey)
  const record = useHuntStore((s) => s.result?.record), chosen = useHuntStore((s) => s.inputs.coordinate)
  const c = chosen ?? record?.hunt.params.coordinate
  const timeZone = c ? resolveTimeZone(c.lat, c.lng).timeZone ?? 'America/Toronto' : 'America/Toronto'
  const [openedAt] = useState(() => new Date()), [local, setLocal] = useState(false)
  const dateKey = selected ?? record?.startDateKey ?? zonedDateKey(openedAt, timeZone)
  const empty = useMemo(() => summarizeObservations([], [], { timeZone }), [timeZone])
  return <div className="mx-auto max-w-3xl space-y-4 p-3"><div className="flex flex-wrap items-center justify-between gap-2 print:hidden"><Link to="/hunt" className="min-h-11 py-3 text-sm text-sky-300 underline">Où et quand chasser</Link><button type="button" onClick={() => window.print()} className="min-h-11 rounded-lg border border-slate-600 px-3 text-sm">Enregistrer en PDF / imprimer</button></div><label className="text-ink-200 flex min-h-11 flex-wrap items-center gap-3 text-sm print:hidden">Date consultée<input type="date" value={dateKey} onChange={(e) => { if (e.target.value) setDateKey(e.target.value) }} className="border-surface-600 bg-surface-900 min-h-11 rounded-lg border px-3"/></label><RutLocationPanel dateKey={dateKey}/><button type="button" aria-expanded={local} onClick={() => setLocal((v) => !v)} className="border-surface-600 text-ink-300 min-h-11 rounded-lg border px-3 text-sm print:hidden">{local ? 'Masquer mes observations facultatives' : 'Afficher mes observations facultatives'}</button>{local ? <ReportWithObservations dateKey={dateKey} timeZone={timeZone}/> : <RutReport dateKey={dateKey} summary={empty}/>}</div>
}
