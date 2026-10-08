import type { DeerEntryKind } from '@/types'

export interface DeerFilterState {
  kinds: DeerEntryKind[]
  /** `YYYY-MM-DD` (local day) or ''. */
  from: string
  to: string
}

export const EMPTY_DEER_FILTERS: DeerFilterState = { kinds: [], from: '', to: '' }

/** Start / end of a local calendar day, in epoch ms. */
export function dayBounds(value: string): { start: number; end: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  return {
    start: new Date(y, m - 1, d, 0, 0, 0, 0).getTime(),
    end: new Date(y, m - 1, d, 23, 59, 59, 999).getTime(),
  }
}
