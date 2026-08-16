import { NavLink } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { navItems } from '@/app/navigation'
import { ConnectionStatus } from './ConnectionStatus'
import { cn } from '@/utils/cn'

/** Desktop/tablet navigation. Hidden below the `md` breakpoint, where the
 * BottomNav takes over. */
export function Sidebar() {
  return (
    <aside className="border-surface-800 bg-surface-900 hidden w-64 shrink-0 flex-col border-r md:flex">
      <div className="border-surface-800 flex items-center gap-2 border-b px-5 py-5">
        <Compass className="text-brand-400" size={22} aria-hidden="true" />
        <div className="leading-tight">
          <p className="text-ink-100 text-sm font-semibold tracking-wide">CTR HUNTING</p>
          <p className="text-ink-500 text-xs">Field Terrain Intelligence</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Primary">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-500/15 text-brand-400'
                  : 'text-ink-300 hover:bg-surface-800 hover:text-ink-100',
              )
            }
          >
            <item.icon size={18} aria-hidden="true" />
            <span className="flex-1">{item.label}</span>
            {item.phase !== null && (
              <span className="text-ink-700 text-[10px] font-semibold">
                P{item.phase}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-surface-800 border-t p-4">
        <ConnectionStatus />
      </div>
    </aside>
  )
}
