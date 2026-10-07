import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './clipboard'

/** SIMULATED clipboard (jsdom stubs). Not a validation on iOS Safari. */
function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true })
}
function setExec(value: unknown) {
  Object.defineProperty(document, 'execCommand', { value, configurable: true })
}

afterEach(() => {
  setClipboard(undefined)
  setExec(undefined)
})

describe('copyText (simulated clipboard)', () => {
  it('returns true when navigator.clipboard.writeText succeeds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })
    await expect(copyText('46.8, -71.2')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('46.8, -71.2')
  })

  it('returns false (no throw, no fallback) when the permission is denied', async () => {
    const writeText = vi.fn().mockRejectedValue(new DOMException('no', 'NotAllowedError'))
    const exec = vi.fn().mockReturnValue(true)
    setClipboard({ writeText })
    setExec(exec)
    await expect(copyText('x')).resolves.toBe(false)
    expect(exec).not.toHaveBeenCalled()
  })

  it('returns false when neither the API nor execCommand exist', async () => {
    setClipboard(undefined)
    setExec(undefined)
    await expect(copyText('x')).resolves.toBe(false)
  })

  it('falls back to a hidden textarea + execCommand when the API is absent', async () => {
    let copiedValue = ''
    const exec = vi.fn(() => {
      copiedValue = (document.activeElement as HTMLTextAreaElement).value
      return true
    })
    setClipboard(undefined)
    setExec(exec)
    await expect(copyText('lat, lng')).resolves.toBe(true)
    expect(exec).toHaveBeenCalledWith('copy')
    expect(copiedValue).toBe('lat, lng')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('returns false when execCommand reports failure or throws', async () => {
    setClipboard(undefined)
    setExec(vi.fn().mockReturnValue(false))
    await expect(copyText('x')).resolves.toBe(false)
    setExec(
      vi.fn(() => {
        throw new Error('boom')
      }),
    )
    await expect(copyText('x')).resolves.toBe(false)
    expect(document.querySelector('textarea')).toBeNull()
  })
})
