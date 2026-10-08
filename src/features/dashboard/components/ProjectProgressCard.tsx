import { Link } from 'react-router-dom'
import { ListChecks } from 'lucide-react'
import { roadmapSummary } from '@/features/about/roadmap'
import { DashboardCard, Hint, LINK_BUTTON_CLASS } from './DashboardCard'

/** Compact « Progression du projet » : chiffres calculés depuis la feuille de
 * route, détail dans Plus → Projet et progression. */
export function ProjectProgressCard() {
  const summary = roadmapSummary()
  return (
    <DashboardCard icon={ListChecks} title="Progression du projet">
      <p className="text-ink-100 text-sm">
        <strong>{summary.done}</strong> phase(s) terminée(s) sur {summary.total} ·{' '}
        <strong>{summary.partial}</strong> partiellement livrée(s)
      </p>
      <Hint>
        Aucune validation sur iPhone réel n’est documentée ; le détail est dans la page de
        progression.
      </Hint>
      <div className="mt-auto">
        <Link to="/project" className={LINK_BUTTON_CLASS}>
          Voir le détail
        </Link>
      </div>
    </DashboardCard>
  )
}
