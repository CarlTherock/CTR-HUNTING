import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const RETRY_MS = 100
const MAX_TRIES = 30

/**
 * Scrolls to the element named by the URL hash (`/help#limites-gps`,
 * `/settings#donnees-et-sauvegarde`). Browsers only do this by themselves when
 * the element already exists at navigation time; here pages render (and some
 * sections load) afterwards, so the target is looked for again for a few
 * seconds, then given up on silently.
 */
export function useHashScroll(): void {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (!hash || hash.length < 2) return
    const id = decodeURIComponent(hash.slice(1))
    let tries = 0
    const timer = setInterval(() => {
      tries += 1
      const target = document.getElementById(id)
      if (target) {
        target.scrollIntoView?.({ block: 'start' })
        clearInterval(timer)
      } else if (tries >= MAX_TRIES) {
        clearInterval(timer)
      }
    }, RETRY_MS)
    return () => clearInterval(timer)
  }, [pathname, hash])
}
