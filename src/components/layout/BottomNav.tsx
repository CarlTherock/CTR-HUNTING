import { NavLink } from 'react-router-dom'
import { navItems } from '@/app/navigation'
import { cn } from '@/utils/cn'

/** Mobile field navigation: large touch targets, primary sections only. */
export function BottomNav() {
  const primaryItems = navItems.filter((item) => item.primary)

  return (
    <nav
      className="border-surface-800 bg-surface-900/95 fixed inset-x-0 bottom-0 z-20 flex border-t backdrop-blur md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Primary"
    >
      {primaryItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === '/'}
          className={({ isActive }) =>
            cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors',
              isActive ? 'text-brand-400' : 'text-ink-500',
            )
          }
        >
          <item.icon size={20} aria-hidden="true" />
          {item.label.split(' ')[0]}
        </NavLink>
      ))}
    </nav>
  )
}
