import { Link } from 'react-router-dom'
import { Map as MapIcon } from 'lucide-react'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { DashboardCard, Hint, LINK_BUTTON_CLASS } from './DashboardCard'

/** Main entry: the map, plus an actionable empty state for a new user. */
export function QuickAccessCard() {
  const waypoints = useWaypointsStore((s) => s.waypoints)
  const loaded = useWaypointsStore((s) => s.loaded)

  return (
    <DashboardCard icon={MapIcon} title="Carte">
      <Link
        to="/map"
        className="bg-brand-500 text-surface-950 hover:bg-brand-400 inline-flex h-12 items-center justify-center rounded-lg px-5 text-base font-semibold"
      >
        Ouvrir la carte
      </Link>
      {loaded && waypoints.length === 0 ? (
        <p className="text-ink-300 text-sm">
          Aucun point de repère.{' '}
          <Link to="/map" className="text-brand-400 font-medium underline">
            Créer le premier
          </Link>{' '}
          sur la carte.
        </p>
      ) : (
        <Hint>
          {loaded ? `${waypoints.length} point(s) de repère enregistré(s).` : ' '}
        </Hint>
      )}
      <div className="mt-auto flex flex-wrap gap-2">
        <Link to="/waypoints" className={LINK_BUTTON_CLASS}>
          Repères et traces
        </Link>
        <Link to="/analysis" className={LINK_BUTTON_CLASS}>
          Analyse
        </Link>
      </div>
    </DashboardCard>
  )
}
