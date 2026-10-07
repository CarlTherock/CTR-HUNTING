import { useCallback, useEffect, useRef, useState } from 'react'
import { useImmersiveStore } from '@/components/layout/immersiveStore'

/**
 * Immersive map mode + optional native fullscreen.
 *
 *  - normal    — app chrome visible;
 *  - immersive — chrome hidden by the layout (works everywhere, including
 *                iPhone Safari where the Fullscreen API is not available
 *                for ordinary pages);
 *  - native    — immersive + the browser's own Fullscreen API, only where
 *                `document.fullscreenEnabled` says it exists. Leaving it
 *                with the system gesture/Esc also leaves immersive mode.
 */
export function useImmersiveMode() {
  const immersive = useImmersiveStore((state) => state.immersive)
  const setImmersive = useImmersiveStore((state) => state.setImmersive)
  const nativeSupported =
    typeof document !== 'undefined' && document.fullscreenEnabled === true
  const [nativeActive, setNativeActive] = useState(false)
  const nativeRequestedRef = useRef(false)

  const exitNative = useCallback(async () => {
    nativeRequestedRef.current = false
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen()
      } catch {
        // Already leaving; nothing to recover.
      }
    }
  }, [])

  const enterImmersive = useCallback(() => setImmersive(true), [setImmersive])

  const exitImmersive = useCallback(() => {
    setImmersive(false)
    void exitNative()
  }, [setImmersive, exitNative])

  const toggleImmersive = useCallback(() => {
    if (useImmersiveStore.getState().immersive) exitImmersive()
    else enterImmersive()
  }, [enterImmersive, exitImmersive])

  const toggleNative = useCallback(async () => {
    if (!nativeSupported) return
    if (document.fullscreenElement) {
      await exitNative()
      return
    }
    setImmersive(true)
    nativeRequestedRef.current = true
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' })
    } catch {
      // Refused by the browser: the immersive layout still applies.
      nativeRequestedRef.current = false
    }
  }, [nativeSupported, exitNative, setImmersive])

  useEffect(() => {
    function onChange() {
      const active = document.fullscreenElement !== null
      setNativeActive(active)
      if (!active && nativeRequestedRef.current) {
        nativeRequestedRef.current = false
        setImmersive(false)
      }
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [setImmersive])

  // Leaving the map page must always restore the app chrome.
  useEffect(
    () => () => {
      setImmersive(false)
      if (document.fullscreenElement)
        void document.exitFullscreen().catch(() => undefined)
    },
    [setImmersive],
  )

  return {
    immersive,
    nativeSupported,
    nativeActive,
    toggleImmersive,
    toggleNative,
    exitImmersive,
  }
}
