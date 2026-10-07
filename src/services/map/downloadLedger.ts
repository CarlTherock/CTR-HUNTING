import type { DownloadFailure, DownloadSummary } from '@/types'

/** Max entries kept in the failure / absent lists of a summary. */
export const MAX_LEDGER_ENTRIES = 50

/** The URL without query string or fragment — query strings carry API keys
 * and must never reach the ledger, the database or the screen. */
export function stripQuery(url: string): string {
  const cut = url.search(/[?#]/)
  return cut === -1 ? url : url.slice(0, cut)
}

export function emptyDownloadSummary(): DownloadSummary {
  return {
    requested: 0,
    succeeded: 0,
    reused: 0,
    failed: 0,
    absent: 0,
    retried: 0,
    stepsTotal: 0,
    stepsCompleted: 0,
    stepsTimedOut: 0,
    failures: [],
    absentUrls: [],
    essentialFailures: [],
  }
}

type TileState = 'pending' | 'succeeded' | 'reused' | 'failed' | 'absent'

/**
 * Records, request by request, what happened during one download. Each tile
 * URL has exactly one state (the latest outcome wins, except that a network
 * success is never downgraded by a later cache hit of the same URL), so the
 * counters are about distinct tiles, not about how often the engine asked.
 *
 * The ledger is closed when the sweep ends: late answers to requests that
 * outlive the download are ignored instead of mutating a finished summary.
 */
export class DownloadLedger {
  private readonly tiles = new Map<string, TileState>()
  private readonly reasons = new Map<string, string>()
  private readonly essential = new Map<string, string>()
  private bytes = 0
  private retries = 0
  private closed = false
  stepsTotal = 0
  stepsCompleted = 0
  stepsTimedOut = 0

  private readonly onChange: () => void

  constructor(onChange: () => void = () => undefined) {
    this.onChange = onChange
  }

  close(): void {
    this.closed = true
  }

  private set(url: string, state: TileState, reason?: string): void {
    this.tiles.set(url, state)
    if (reason) this.reasons.set(url, reason)
    else this.reasons.delete(url)
    this.onChange()
  }

  requested(url: string): void {
    if (this.closed || this.tiles.has(url)) return
    this.tiles.set(url, 'pending')
  }

  succeeded(url: string, bytes: number): void {
    if (this.closed) return
    if (this.tiles.get(url) !== 'succeeded') this.bytes += bytes
    this.set(url, 'succeeded')
  }

  reused(url: string): void {
    if (this.closed) return
    const state = this.tiles.get(url)
    // Keep "succeeded" (this run fetched it); a failed/absent tile that is
    // later served from cache really is available now.
    if (state === 'succeeded' || state === 'reused') return
    this.set(url, 'reused')
  }

  failed(url: string, reason: string): void {
    if (this.closed) return
    this.set(url, 'failed', reason)
  }

  absent(url: string): void {
    if (this.closed) return
    this.set(url, 'absent')
  }

  retry(): void {
    if (this.closed) return
    this.retries++
    this.onChange()
  }

  essentialFailed(url: string, reason: string): void {
    if (this.closed) return
    this.essential.set(url, reason)
    this.onChange()
  }

  essentialOk(url: string): void {
    if (this.closed) return
    this.essential.delete(url)
  }

  step(result: 'completed' | 'timedOut'): void {
    if (result === 'completed') this.stepsCompleted++
    else this.stepsTimedOut++
    this.onChange()
  }

  /** URLs this run fetched itself (what the area owns and may delete). */
  fetchedUrls(): string[] {
    return this.urlsIn('succeeded')
  }

  get bytesDownloaded(): number {
    return this.bytes
  }

  private urlsIn(state: TileState): string[] {
    const urls: string[] = []
    for (const [url, s] of this.tiles) if (s === state) urls.push(url)
    return urls
  }

  private count(state: TileState): number {
    let n = 0
    for (const s of this.tiles.values()) if (s === state) n++
    return n
  }

  summary(): DownloadSummary {
    const failures: DownloadFailure[] = []
    for (const url of this.urlsIn('failed')) {
      if (failures.length >= MAX_LEDGER_ENTRIES) break
      failures.push({ url: stripQuery(url), reason: this.reasons.get(url) ?? 'erreur' })
    }
    const essentialFailures: DownloadFailure[] = []
    for (const [url, reason] of this.essential) {
      if (essentialFailures.length >= MAX_LEDGER_ENTRIES) break
      essentialFailures.push({ url: stripQuery(url), reason })
    }
    return {
      requested: this.tiles.size,
      succeeded: this.count('succeeded'),
      reused: this.count('reused'),
      failed: this.count('failed'),
      absent: this.count('absent'),
      retried: this.retries,
      stepsTotal: this.stepsTotal,
      stepsCompleted: this.stepsCompleted,
      stepsTimedOut: this.stepsTimedOut,
      failures,
      absentUrls: this.urlsIn('absent').slice(0, MAX_LEDGER_ENTRIES).map(stripQuery),
      essentialFailures,
    }
  }
}
