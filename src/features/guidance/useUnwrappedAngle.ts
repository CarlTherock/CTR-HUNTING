import { useState } from 'react'
import { unwrapAngle } from './angles'

/**
 * Keeps the displayed rotation continuous: the unbounded angle that is
 * equivalent to `next` and closest to the one currently shown (see
 * `unwrapAngle`), so the arrow never spins the long way at 359 -> 0.
 * The previous angle is state adjusted during render (React's supported
 * "derive state from props" pattern), not a ref read while rendering.
 */
export function useUnwrappedAngle(next: number | null): number | null {
  const [state, setState] = useState<{ source: number | null; shown: number | null }>({
    source: next,
    shown: next,
  })
  if (state.source === next) return state.shown
  const shown = next === null ? null : unwrapAngle(state.shown, next)
  setState({ source: next, shown })
  return shown
}
