import { Outlet, useMatch } from 'react-router-dom'
import { cn } from '@/utils/cn'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { TopBar } from './TopBar'
import { useImmersiveStore } from './immersiveStore'

/**
 * Root responsive layout: a persistent sidebar on md+ (tablet/desktop) and
 * a top bar + bottom tab bar on mobile. Both surfaces read from the same
 * `navItems` config and route through the same `<Outlet />`.
 *
 * Height chain (one definite height from html down to the map canvas):
 *   root `h-dvh` → column `min-h-0 flex-1` → `main` `min-h-0 flex-1`.
 * TopBar and BottomNav are *in flow* (not `fixed`) so they take their own
 * space instead of covering the bottom of the page, and safe-area insets
 * are applied once, by the element touching that screen edge — never on
 * `body` as well.
 *
 * The map route is a full-bleed, non-scrolling surface: its page owns its
 * layout and nothing may scroll behind it. Every other route scrolls
 * inside `main`.
 *
 * Immersive mode (map only) hides all chrome; the shell then applies the
 * safe-area insets itself so the map never sits under a notch or the home
 * indicator.
 */
export function AppShell() {
  const isMapRoute = useMatch('/map') !== null
  const immersive = useImmersiveStore((state) => state.immersive) && isMapRoute

  return (
    <div
      className="bg-surface-950 text-ink-100 flex h-dvh overflow-hidden"
      style={{
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
        paddingTop: immersive ? 'env(safe-area-inset-top)' : undefined,
        paddingBottom: immersive ? 'env(safe-area-inset-bottom)' : undefined,
      }}
    >
      {!immersive && <Sidebar />}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!immersive && <TopBar />}
        <main
          className={cn(
            'min-h-0 flex-1',
            isMapRoute ? 'flex flex-col overflow-hidden' : 'overflow-y-auto p-4 md:p-6',
          )}
        >
          <Outlet />
        </main>
        {!immersive && <BottomNav />}
      </div>
    </div>
  )
}
