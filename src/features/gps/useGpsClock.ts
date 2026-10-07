import { useEffect, useState } from 'react'

/** Re-renders its caller every `intervalMs` (default 5 s) with the current
 * time, so "relevé il y a N s" keeps moving. The timer is cleared on unmount. */
export function useGpsClock(intervalMs = 5000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
