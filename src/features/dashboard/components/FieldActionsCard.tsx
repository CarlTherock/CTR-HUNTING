import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Droplets } from 'lucide-react'
import { useBloodStore } from '@/features/blood/state/bloodStore'
import { DashboardCard, Hint, LINK_BUTTON_CLASS } from './DashboardCard'

/** Quick access to the field workflows that used to be buried in sub-pages:
 * blood search (with the open session, if any), photos and DeerTracker. */
export function FieldActionsCard() {
  const loaded = useBloodStore((s) => s.loaded)
  const load = useBloodStore((s) => s.load)
  const sessions = useBloodStore((s) => s.sessions)
  useEffect(() => {
    if (!loaded) void load().catch(() => undefined)
  }, [loaded, load])

  const open = sessions.find((s) => s.status !== 'finished')

  return (
    <DashboardCard icon={Droplets} title="Sur le terrain">
      {open ? (
        <p className="text-ink-100 text-sm">
          Recherche de sang en cours : <strong>{open.name}</strong>.{' '}
          <Link to="/map" className="text-brand-400 font-medium underline">
            Reprendre sur la carte
          </Link>
        </p>
      ) : (
        <Hint>
          Recherche de sang : démarrez-la depuis la carte (Outils), ou consultez les
          sessions enregistrées.
        </Hint>
      )}
      <div className="mt-auto flex flex-wrap gap-2">
        <Link to="/after-shot" className={LINK_BUTTON_CLASS}>
          Après le tir
        </Link>
        <Link to="/waypoints#recherches-de-sang" className={LINK_BUTTON_CLASS}>
          Recherches de sang
        </Link>
        <Link to="/deertracker" className={LINK_BUTTON_CLASS}>
          DeerTracker
        </Link>
        <Link to="/journal" className={LINK_BUTTON_CLASS}>
          Journal et photos
        </Link>
      </div>
    </DashboardCard>
  )
}
