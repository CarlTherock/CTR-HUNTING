import { useEffect, useState } from 'react'
import { Compass } from 'lucide-react'
import { cn } from '@/utils/cn'

const VISIBLE_MS = 2600
const FADE_MS = 450

export interface SplashProps {
  /** Called once the splash has finished (including its fade-out), so the
   * caller can unmount it. */
  onDone: () => void
}

/**
 * Branded opening screen shown once per cold launch when the PWA is
 * running standalone (installed on a phone) — a real device's launch
 * already shows the OS-level manifest splash first; this is the
 * in-app moment right after, so the transition into the dashboard
 * doesn't feel like an abrupt jump-cut. Never shown for a normal
 * browser-tab visit — see `isStandalonePwa()` in `App.tsx`.
 */
export function Splash({ onDone }: SplashProps) {
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), VISIBLE_MS)
    const doneTimer = setTimeout(onDone, VISIBLE_MS + FADE_MS)
    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(doneTimer)
    }
  }, [onDone])

  return (
    <div
      role="presentation"
      className={cn(
        'fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 transition-opacity ease-out',
        fading ? 'pointer-events-none opacity-0' : 'opacity-100',
      )}
      style={{
        transitionDuration: `${FADE_MS}ms`,
        background:
          'radial-gradient(circle at 50% 38%, rgba(74,222,128,0.16), transparent 62%), var(--color-surface-950)',
      }}
    >
      <Compass
        size={64}
        strokeWidth={1.5}
        className="text-brand-400 [animation:splash-icon_0.7s_ease-out_forwards]"
      />
      <div className="flex flex-col items-center gap-1.5">
        <p className="text-ink-100 text-2xl font-bold tracking-[0.2em] [animation:splash-text_0.5s_ease-out_0.3s_both]">
          CTR HUNTING
        </p>
        <p className="text-ink-500 text-xs tracking-[0.15em] uppercase [animation:splash-text_0.5s_ease-out_0.48s_both]">
          Field Terrain Intelligence
        </p>
      </div>
      <div className="bg-surface-700 h-px w-20 overflow-hidden rounded-full">
        <div className="bg-brand-400 h-full w-full origin-left [animation:splash-sweep_1s_ease-in-out_0.65s_both]" />
      </div>
    </div>
  )
}
