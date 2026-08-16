import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { TopBar } from './TopBar'

/**
 * Root responsive layout: a persistent sidebar on md+ (tablet/desktop) and
 * a top bar + bottom tab bar on mobile. Both surfaces read from the same
 * `navItems` config and route through the same `<Outlet />`, so every
 * feature page automatically works in both layouts.
 */
export function AppShell() {
  return (
    <div className="bg-surface-950 text-ink-100 flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-4 pb-20 md:p-6 md:pb-6">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
