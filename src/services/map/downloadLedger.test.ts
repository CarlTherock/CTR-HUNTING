import { describe, expect, it, vi } from 'vitest'
import { DownloadLedger, MAX_LEDGER_ENTRIES, stripQuery } from './downloadLedger'

describe('stripQuery', () => {
  it('removes the query string and fragment (API keys)', () => {
    expect(stripQuery('https://a.test/t/1/2/3.pbf?key=SECRET&x=1#f')).toBe(
      'https://a.test/t/1/2/3.pbf',
    )
    expect(stripQuery('https://a.test/t')).toBe('https://a.test/t')
  })
})

describe('DownloadLedger', () => {
  it('counts distinct tiles by their latest outcome; a retried tile that then succeeds is not a failure', () => {
    const ledger = new DownloadLedger()
    ledger.requested('u1')
    ledger.failed('u1', 'timeout')
    ledger.succeeded('u1', 100)
    ledger.reused('u2')
    ledger.absent('u3')
    ledger.failed('u4', 'HTTP 503')
    ledger.retry()
    const s = ledger.summary()
    expect(s).toMatchObject({
      requested: 4,
      succeeded: 1,
      reused: 1,
      absent: 1,
      failed: 1,
      retried: 1,
    })
    expect(ledger.bytesDownloaded).toBe(100)
    expect(ledger.fetchedUrls()).toEqual(['u1'])
  })

  it('never downgrades a network success to "reused" and counts its bytes once', () => {
    const ledger = new DownloadLedger()
    ledger.succeeded('u', 50)
    ledger.reused('u')
    ledger.succeeded('u', 50)
    expect(ledger.summary()).toMatchObject({ succeeded: 1, reused: 0 })
    expect(ledger.bytesDownloaded).toBe(50)
  })

  it('records failures without query string and caps the list at 50 (counter stays exact)', () => {
    const ledger = new DownloadLedger()
    for (let i = 0; i < 60; i++)
      ledger.failed(`https://t.test/${i}.pbf?key=SECRET`, 'réseau')
    const s = ledger.summary()
    expect(s.failed).toBe(60)
    expect(s.failures).toHaveLength(MAX_LEDGER_ENTRIES)
    expect(JSON.stringify(s)).not.toContain('SECRET')
    expect(s.failures[0]).toEqual({ url: 'https://t.test/0.pbf', reason: 'réseau' })
  })

  it('tracks essential failures (cleared by a later success) and sweep steps', () => {
    const ledger = new DownloadLedger()
    ledger.essentialFailed('https://s.test/style.json?key=SECRET', 'HTTP 500')
    expect(ledger.summary().essentialFailures).toEqual([
      { url: 'https://s.test/style.json', reason: 'HTTP 500' },
    ])
    ledger.essentialOk('https://s.test/style.json?key=SECRET')
    expect(ledger.summary().essentialFailures).toEqual([])

    ledger.stepsTotal = 3
    ledger.step('completed')
    ledger.step('timedOut')
    expect(ledger.summary()).toMatchObject({
      stepsTotal: 3,
      stepsCompleted: 1,
      stepsTimedOut: 1,
    })
  })

  it('notifies on change and ignores late records once closed', () => {
    const onChange = vi.fn()
    const ledger = new DownloadLedger(onChange)
    ledger.succeeded('a', 1)
    expect(onChange).toHaveBeenCalledTimes(1)
    ledger.close()
    ledger.failed('b', 'timeout')
    ledger.succeeded('c', 1)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(ledger.summary()).toMatchObject({ requested: 1, failed: 0 })
  })
})
