import { Link } from 'react-router-dom'
import { NotebookPen } from 'lucide-react'
import { useJournalStore } from '@/features/journal/state/journalStore'
import {
  useTracksStore,
  isInterruptedTrack,
} from '@/features/waypoints/state/tracksStore'
import { formatDateFr } from '@/features/backup/restoreLabels'
import { lastOuting } from '../summary'
import { DashboardCard, Hint, LINK_BUTTON_CLASS } from './DashboardCard'

/** Journal and last outing: the most recent track or journal entry. */
export function OutingCard() {
  const tracks = useTracksStore((s) => s.tracks)
  const recordingId = useTracksStore((s) => s.recordingId)
  const observations = useJournalStore((s) => s.observations)

  const last = lastOuting(tracks, observations)
  const interrupted = tracks.filter((t) => isInterruptedTrack(t, recordingId)).length

  return (
    <DashboardCard icon={NotebookPen} title="Journal et dernière sortie">
      {last ? (
        <p className="text-ink-100 text-sm">
          {last.kind === 'track' ? 'Dernière trace' : 'Dernière entrée'} :{' '}
          <strong>{last.label}</strong>
          <span className="text-ink-500 block text-xs">{formatDateFr(last.at)}</span>
        </p>
      ) : (
        <p className="text-ink-300 text-sm">
          Aucune trace ni entrée de journal. Enregistrez une trace depuis la carte, ou
          ouvrez le journal.
        </p>
      )}
      <Hint>
        {tracks.length} trace(s) · {observations.length} entrée(s) de journal
      </Hint>
      {interrupted > 0 && (
        <p role="status" className="text-status-warning text-xs">
          {interrupted} trace(s) interrompue(s) : l’application a été fermée pendant
          l’enregistrement.{' '}
          <Link to="/waypoints" className="underline">
            Les voir
          </Link>
        </p>
      )}
      <div className="mt-auto flex flex-wrap gap-2">
        <Link to="/journal" className={LINK_BUTTON_CLASS}>
          Ouvrir le journal
        </Link>
        <Link to="/waypoints" className={LINK_BUTTON_CLASS}>
          Traces
        </Link>
      </div>
    </DashboardCard>
  )
}
