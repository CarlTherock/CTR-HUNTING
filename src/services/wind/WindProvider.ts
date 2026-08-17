import type { WindField } from '@/types'
import type { LngLatBounds } from '@/utils/tiles'

/**
 * Adapter contract for the wind engine (Phase 6) — a dedicated provider
 * from weather's (Phase 5), per the spec's phase split, even though
 * both currently happen to use the same vendor. Features depend only on
 * this interface, never a concrete provider class.
 */
export interface WindProvider {
  /** Fetches a real grid of wind samples (`gridSize` × `gridSize` points)
   * covering `bounds`, in one batched request rather than `gridSize²`
   * separate ones. Throws on failure — callers handle the fallback. */
  fetchWindField(bounds: LngLatBounds, gridSize: number): Promise<WindField>
}
