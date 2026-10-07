import { afterEach, describe, expect, it, vi } from 'vitest'
import { sharePayload } from './share'

/** SIMULATED Web Share API (jsdom stubs). Not a validation on iOS Safari. */
const payload = { title: 'T', text: 'body', url: 'https://example.test/' }

function setNav(name: 'share' | 'canShare', value: unknown) {
  Object.defineProperty(navigator, name, { value, configurable: true, writable: true })
}

afterEach(() => {
  setNav('share', undefined)
  setNav('canShare', undefined)
})

describe('sharePayload (simulated Web Share API)', () => {
  it('is unsupported without navigator.share', async () => {
    await expect(sharePayload(payload)).resolves.toBe('unsupported')
  })

  it('resolves shared when the system sheet completes', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    setNav('share', share)
    await expect(sharePayload(payload)).resolves.toBe('shared')
    expect(share).toHaveBeenCalledWith(payload)
  })

  it('treats AbortError as a cancellation, not a failure', async () => {
    setNav('share', vi.fn().mockRejectedValue(new DOMException('x', 'AbortError')))
    await expect(sharePayload(payload)).resolves.toBe('cancelled')
  })

  it('reports other errors as failed', async () => {
    setNav('share', vi.fn().mockRejectedValue(new DOMException('x', 'NotAllowedError')))
    await expect(sharePayload(payload)).resolves.toBe('failed')
  })

  it('is unsupported when canShare refuses the payload (share not called)', async () => {
    const share = vi.fn()
    setNav('share', share)
    setNav('canShare', vi.fn().mockReturnValue(false))
    await expect(sharePayload(payload)).resolves.toBe('unsupported')
    expect(share).not.toHaveBeenCalled()
  })

  it('reports failed when canShare itself throws', async () => {
    setNav('share', vi.fn())
    setNav(
      'canShare',
      vi.fn(() => {
        throw new TypeError('bad')
      }),
    )
    await expect(sharePayload(payload)).resolves.toBe('failed')
  })
})
