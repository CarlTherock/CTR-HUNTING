import { Outlet, useMatch } from 'react-router-dom'
import { cn } from '@/utils/cn'
import { useWindAnalysisStore } from '@/features/wind/state/windAnalysisStore'
import { SharedPointHandler } from '@/features/share/components/SharedPointHandler'
import { OnboardingDialog } from '@/features/onboarding/components/OnboardingDialog'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { TopBar } from './TopBar'
import { useImmersiveStore } from './immersiveStore'
import { useHashScroll } from './useHashScroll'

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
 * While « Analyse du vent » is open on the map, the bottom navigation is
 * hidden (not removed from the app) and the sheet owns the bottom safe area.
 *
 * Immersive mode (map only) hides all chrome; the shell then applies the
 * safe-area insets itself so the map never sits under a notch or the home
 * indicator.
 */
export function AppShell() {
  useHashScroll()
  const isMapRoute = useMatch('/map') !== null
  const immersive = useImmersiveStore((state) => state.immersive) && isMapRoute
  // « Analyse du vent » (map only) takes the place of the bottom navigation:
  // the bar is unmounted — no empty height, not focusable behind the sheet —
  // and comes back as soon as the panel is closed. Only the layout hides it.
  const windSheetOpen = useWindAnalysisStore((state) => state.open) && isMapRoute

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
      <SharedPointHandler />
      <OnboardingDialog />
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
        {!immersive && !windSheetOpen && <BottomNav />}
      </div>
    </div>
  )
}
