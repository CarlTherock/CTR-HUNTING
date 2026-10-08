import { Link, NavLink } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { NAV_GROUP_LABEL, navItems, navTarget, type NavGroup } from '@/app/navigation'
import { APP_TAGLINE } from '@/app/appInfo'
import { ConnectionStatus } from './ConnectionStatus'
import { cn } from '@/utils/cn'

const GROUPS: readonly NavGroup[] = ['main', 'data', 'analysis', 'more']
const LINK_CLASS =
  'flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors'
const IDLE_CLASS = 'text-ink-300 hover:bg-surface-800 hover:text-ink-100'

/** Desktop/tablet navigation. Hidden below the `md` breakpoint, where the
 * BottomNav takes over. */
export function Sidebar() {
  return (
    <aside className="border-surface-800 bg-surface-900 hidden w-64 shrink-0 flex-col border-r md:flex">
      <div className="border-surface-800 flex items-center gap-2 border-b px-5 py-5">
        <Compass className="text-brand-400" size={22} aria-hidden="true" />
        <div className="leading-tight">
          <p className="text-ink-100 text-sm font-semibold tracking-wide">CTR HUNTING</p>
          <p className="text-ink-500 text-xs">{APP_TAGLINE}</p>
        </div>
      </div>

      <nav
        className="flex-1 space-y-4 overflow-y-auto p-3"
        aria-label="Sections de l’application"
      >
        {GROUPS.map((group) => (
          <div key={group} className="space-y-1">
            <p className="text-ink-500 px-3 text-[11px] font-semibold tracking-wider uppercase">
              {NAV_GROUP_LABEL[group]}
            </p>
            {navItems
              .filter((item) => item.group === group && !item.hideInSidebar)
              .map((item) =>
                item.hash ? (
                  // An entry pointing inside a page is never "active" on its own.
                  <Link
                    key={`${item.path}#${item.hash}`}
                    to={navTarget(item)}
                    className={cn(LINK_CLASS, IDLE_CLASS)}
                  >
                    <item.icon size={18} aria-hidden="true" />
                    <span className="flex-1">{item.label}</span>
                  </Link>
                ) : (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/'}
                    className={({ isActive }) =>
                      cn(
                        LINK_CLASS,
                        isActive ? 'bg-brand-500/15 text-brand-400' : IDLE_CLASS,
                      )
                    }
                  >
                    <item.icon size={18} aria-hidden="true" />
                    <span className="flex-1">{item.label}</span>
                  </NavLink>
                ),
              )}
          </div>
        ))}
      </nav>

      <div className="border-surface-800 border-t p-4">
        <ConnectionStatus />
      </div>
    </aside>
  )
}
