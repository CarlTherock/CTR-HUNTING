import { useState } from 'react'
import { RouterProvider } from 'react-router-dom'
import { router } from './routes'
import { Splash } from '@/components/layout'

/** True when installed and launched as a standalone app (Android/desktop
 * via `display-mode`, iOS Safari via the legacy `navigator.standalone`
 * flag) — never true for an ordinary browser tab. */
function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone
  return window.matchMedia('(display-mode: standalone)').matches || iosStandalone === true
}

export function App() {
  const [showSplash, setShowSplash] = useState(isStandalonePwa)

  return (
    <>
      <RouterProvider router={router} />
      {showSplash && <Splash onDone={() => setShowSplash(false)} />}
    </>
  )
}
