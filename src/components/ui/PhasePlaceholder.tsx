import type { ReactNode } from 'react'
import { Construction } from 'lucide-react'
import { PageHeader } from './PageHeader'
import { EmptyState } from './EmptyState'
import { Badge } from './Badge'

export interface PhasePlaceholderProps {
  title: string
  description: string
  phase: number
  phaseName: string
  upcoming: string[]
  actions?: ReactNode
}

/**
 * Consistent "not built yet" page used by every feature whose phase hasn't
 * started. Keeps placeholder pages honest (no fake data, no implied
 * functionality) while still looking intentional rather than broken.
 */
export function PhasePlaceholder({
  title,
  description,
  phase,
  phaseName,
  upcoming,
  actions,
}: PhasePlaceholderProps) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={title}
        description={description}
        actions={
          actions ?? (
            <Badge variant="brand">
              Phase {phase} · {phaseName}
            </Badge>
          )
        }
      />
      <EmptyState
        icon={<Construction size={28} aria-hidden="true" />}
        title="Not built yet"
        description="This section is on the roadmap and hasn't been implemented. Nothing shown here is real data."
      />
      <div>
        <h2 className="text-ink-300 mb-2 text-sm font-semibold">
          Planned for this phase
        </h2>
        <ul className="text-ink-500 grid list-inside list-disc grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {upcoming.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
