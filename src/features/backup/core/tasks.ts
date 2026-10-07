/**
 * Cooperative cancellation, progress and time-slicing shared by every
 * long-running backup / restore / GPX operation.
 *
 * There is deliberately no Web Worker here (see `README.md`): the heavy part
 * of an archive is photo bytes, which are *stored*, not compressed, so the
 * work is dominated by memory copies and checksums that are cut into slices
 * of a few milliseconds. `createYielder` hands the thread back to the browser
 * between slices, so taps and scrolling stay responsive, and it is also the
 * place where cancellation is observed.
 */
export class BackupCancelledError extends Error {
  constructor() {
    super('Opération annulée.')
    this.name = 'BackupCancelledError'
  }
}

export interface Progress {
  /** Short French label of the current step, e.g. « Photos ». */
  phase: string
  done: number
  total: number
}

export type ProgressFn = (progress: Progress) => void

export interface RunOptions {
  signal?: AbortSignal
  onProgress?: ProgressFn
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new BackupCancelledError()
}

/** Lets the browser breathe: a macrotask boundary, not just a microtask. */
export function nextMacrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function clock(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

/**
 * Returns functions to call inside loops. `tick` only really yields when more
 * than `sliceMs` have elapsed since the previous yield, so cheap iterations
 * cost nothing; both always check the abort signal.
 */
export function createYielder(
  signal?: AbortSignal,
  sliceMs = 12,
): { tick: () => Promise<void>; force: () => Promise<void> } {
  let last = clock()
  return {
    async tick() {
      throwIfAborted(signal)
      if (clock() - last >= sliceMs) {
        await nextMacrotask()
        last = clock()
        throwIfAborted(signal)
      }
    },
    async force() {
      throwIfAborted(signal)
      await nextMacrotask()
      last = clock()
      throwIfAborted(signal)
    },
  }
}
