import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/ui'
import { hubItems, navTarget, type NavHub, type NavItem } from '@/app/navigation'

function HubList({ hub, label }: { hub: NavHub; label: string }) {
  const items = hubItems(hub)
  return (
    <nav aria-label={label}>
      <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {items.map((item: NavItem) => (
          <li key={`${item.path}#${item.hash ?? ''}`}>
            <Link
              to={navTarget(item)}
              className="border-surface-700 bg-surface-900 hover:bg-surface-800 focus-visible:outline-brand-400 flex min-h-16 items-center gap-3 rounded-lg border p-3 focus-visible:outline-2"
            >
              <span className="bg-surface-800 text-brand-400 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                <item.icon size={20} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-ink-100 block text-sm font-semibold">
                  {item.label}
                </span>
                {item.description && (
                  <span className="text-ink-500 block text-xs">{item.description}</span>
                )}
              </span>
              <ChevronRight size={18} aria-hidden="true" className="text-ink-500" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** « Mes données » : everything the user recorded on this device. */
export function DataHubPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Mes données"
        description="Ce que vous avez enregistré, stocké sur cet appareil."
      />
      <HubList hub="data" label="Mes données" />
    </div>
  )
}

/** « Plus » : assistant, progression du projet, sauvegarde, réglages, aide. */
export function MoreHubPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Plus"
        description="Assistant, progression du projet, sauvegarde, réglages et aide."
      />
      <HubList hub="more" label="Plus" />
    </div>
  )
}
