import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { TopBar } from './TopBar'

/**
 * Root responsive layout: a persistent sidebar on md+ (tablet/desktop) and
 * a top bar + bottom tab bar on mobile. Both surfaces read from the same
 * `navItems` config and route through the same `<Outlet />`, so every
 * feature page automatically works in both layouts.
 *
 * `h-dvh` (fixed), not `min-h-dvh` — a min-height lets the whole page grow
 * taller than the viewport when content needs more room, which defeats
 * `main`'s own `overflow-y-auto` (nothing to scroll *within* if the
 * outer page already grew to fit) and, on the Map page specifically, left
 * its `h-full` map container without a real bound to fill: it fell back
 * to `min-h-[60vh]`, which combined with the header/nav chrome could push
 * floating controls (like "recenter on me") below the fold, only
 * reachable by scrolling the *page* — except that scroll gesture landed
 * on the map canvas instead, which consumes it to pan rather than letting
 * the page scroll.
 */
export function AppShell() {
  return (
    <div className="bg-surface-950 text-ink-100 flex h-dvh">
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
