import { useEffect, useState } from 'react'

/** Current date, refreshed every `periodMs` (statuses like « anciennes »). */
export function useNow(periodMs: number): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), periodMs)
    return () => clearInterval(timer)
  }, [periodMs])
  return now
}
