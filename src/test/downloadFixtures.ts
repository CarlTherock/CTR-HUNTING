import type { DownloadAreaProgress } from '@/services/map'
import type { DownloadSummary } from '@/types'

/** A clean, fully successful download summary (override what a test needs). */
export function summaryFixture(
  overrides: Partial<DownloadSummary> = {},
): DownloadSummary {
  return {
    requested: 4,
    succeeded: 4,
    reused: 0,
    failed: 0,
    absent: 0,
    retried: 0,
    stepsTotal: 2,
    stepsCompleted: 2,
    stepsTimedOut: 0,
    failures: [],
    absentUrls: [],
    essentialFailures: [],
    ...overrides,
  }
}

export function progressFixture(
  overrides: Partial<Omit<DownloadAreaProgress, 'summary'>> & {
    summary?: Partial<DownloadSummary>
  } = {},
): DownloadAreaProgress {
  const { summary, ...rest } = overrides
  return {
    tilesDownloaded: 4,
    bytesDownloaded: 40_000,
    tileUrls: ['a', 'b', 'c', 'd'],
    ...rest,
    summary: summaryFixture(summary),
  }
}
