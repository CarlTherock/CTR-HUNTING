import { Link, useNavigate } from 'react-router-dom'
import { Navigation } from 'lucide-react'
import { Button } from '@/components/ui'
import {
  useGuidanceDestination,
  useGuidanceStore,
} from '@/features/guidance/state/guidanceStore'
import { DashboardCard, Hint, LINK_BUTTON_CLASS } from './DashboardCard'

/** Active « Aller à » destination, with resume/stop. A guidance session is
 * not saved across a reload, so after a restart this shows the empty state. */
export function GuidanceCard() {
  const destination = useGuidanceDestination()
  const notice = useGuidanceStore((s) => s.notice)
  const stop = useGuidanceStore((s) => s.stop)
  const dismissNotice = useGuidanceStore((s) => s.dismissNotice)
  const navigate = useNavigate()

  return (
    <DashboardCard icon={Navigation} title="Destination active">
      {destination ? (
        <>
          <p className="text-ink-100 text-sm">
            Guidage en cours vers <strong>« {destination.name} »</strong>.
          </p>
          <div className="mt-auto flex flex-wrap gap-2">
            <Button size="sm" onClick={() => navigate('/map')}>
              Reprendre
            </Button>
            <Button size="sm" variant="secondary" onClick={stop}>
              Arrêter
            </Button>
          </div>
          <Hint>Le guidage s’arrête de lui-même si l’application est rechargée.</Hint>
        </>
      ) : (
        <>
          <p className="text-ink-300 text-sm">Aucun guidage en cours.</p>
          <div className="mt-auto">
            <Link to="/waypoints" className={LINK_BUTTON_CLASS}>
              Choisir un point de repère
            </Link>
          </div>
        </>
      )}
      {notice && (
        <p role="status" className="text-status-warning text-xs">
          {notice}{' '}
          <button type="button" onClick={dismissNotice} className="underline">
            Fermer
          </button>
        </p>
      )}
    </DashboardCard>
  )
}
