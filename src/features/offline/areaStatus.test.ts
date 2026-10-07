import { describe, expect, it } from 'vitest'
import { summaryFixture } from '@/test/downloadFixtures'
import {
  canRetryArea,
  deriveAreaStatus,
  describeRequests,
  effectiveAreaStatus,
} from './areaStatus'

describe('deriveAreaStatus', () => {
  it('is complete only for a clean, fully swept download with at least one tile', () => {
    expect(deriveAreaStatus(summaryFixture())).toBe('complete')
    expect(deriveAreaStatus(summaryFixture({ succeeded: 0, reused: 4 }))).toBe('complete')
    expect(deriveAreaStatus(summaryFixture({ absent: 3 }))).toBe('complete')
  })

  it.each([
    ['failed request', { failed: 1 }],
    ['failure listed', { failures: [{ url: 'u', reason: 'réseau' }] }],
    ['timed-out step', { stepsCompleted: 1, stepsTimedOut: 1 }],
    ['unfinished sweep', { stepsCompleted: 1 }],
    ['essential failure', { essentialFailures: [{ url: 'u', reason: 'HTTP 404' }] }],
    ['no tile available', { succeeded: 0, reused: 0 }],
    ['no steps', { stepsTotal: 0, stepsCompleted: 0 }],
  ])('is incomplete with a %s', (_label, overrides) => {
    expect(deriveAreaStatus(summaryFixture(overrides))).toBe('incomplete')
  })
})

describe('effectiveAreaStatus (legacy records)', () => {
  it('maps a legacy complete without summary to complete-unverified', () => {
    expect(effectiveAreaStatus({ status: 'complete' })).toBe('complete-unverified')
  })
  it('maps a legacy cancelled to interrupted', () => {
    expect(effectiveAreaStatus({ status: 'cancelled' })).toBe('interrupted')
  })
  it('keeps the other statuses, and re-checks a complete record against its summary', () => {
    expect(effectiveAreaStatus({ status: 'complete', summary: summaryFixture() })).toBe(
      'complete',
    )
    expect(
      effectiveAreaStatus({ status: 'complete', summary: summaryFixture({ failed: 2 }) }),
    ).toBe('incomplete')
    expect(effectiveAreaStatus({ status: 'error' })).toBe('error')
    expect(effectiveAreaStatus({ status: 'downloading' })).toBe('downloading')
  })
  it('offers a retry for incomplete / interrupted / error only', () => {
    expect(canRetryArea({ status: 'incomplete' })).toBe(true)
    expect(canRetryArea({ status: 'interrupted' })).toBe(true)
    expect(canRetryArea({ status: 'cancelled' })).toBe(true)
    expect(canRetryArea({ status: 'error' })).toBe(true)
    expect(canRetryArea({ status: 'complete' })).toBe(false)
    expect(canRetryArea({ status: 'complete', summary: summaryFixture() })).toBe(false)
  })
})

describe('describeRequests', () => {
  it('reports request counts, not a coverage percentage', () => {
    const text = describeRequests(summaryFixture({ succeeded: 40, reused: 2, failed: 3 }))
    expect(text).toBe('42 requêtes réussies · 3 échecs')
    expect(text).not.toMatch(/%/)
  })
})
