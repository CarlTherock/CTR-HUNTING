import { useLocation } from 'react-router-dom'
import { navItems } from '@/app/navigation'
import { ConnectionStatus } from './ConnectionStatus'

export function TopBar() {
  const location = useLocation()
  const current = navItems.find(
    (item) =>
      item.path === location.pathname ||
      (item.path !== '/' && location.pathname.startsWith(item.path)),
  )

  return (
    <header className="border-surface-800 bg-surface-900/60 flex h-14 shrink-0 items-center justify-between border-b px-4 md:hidden">
      <p className="text-ink-100 text-sm font-semibold">
        {current?.label ?? 'CTR Hunting'}
      </p>
      <ConnectionStatus />
    </header>
  )
}
