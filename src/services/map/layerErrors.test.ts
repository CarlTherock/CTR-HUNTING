import { describe, expect, it } from 'vitest'
import { classifyLayerError, isRetryableKind, MAX_LAYER_RETRIES } from './layerErrors'

const online = { online: true }

describe('classifyLayerError', () => {
  it.each([
    [{ ...online, keyMissing: true }, 'missing-key'],
    [{ ...online, status: 403 }, 'provider-refused'],
    [{ ...online, status: 401 }, 'provider-refused'],
    [{ ...online, status: 404 }, 'layer-not-found'],
    [{ ...online, rawMessage: 'LayerNotDefined: foo' }, 'layer-not-found'],
    [{ ...online, status: 400 }, 'bad-params'],
    [{ ...online, rawMessage: 'InvalidCRS' }, 'bad-params'],
    [{ ...online, status: 503 }, 'tile-failure'],
    [{ ...online, rawMessage: 'style failed to load' }, 'style-unavailable'],
    [{ ...online, incompatibleWithBase: true }, 'incompatible'],
    [{ online: false }, 'not-offline'],
    [{ ...online }, 'unknown'],
  ] as const)('%j → %s', (input, kind) => {
    expect(classifyLayerError(input).kind).toBe(kind)
  })

  it('offers a retry only where it can help, and a bounded number of times', () => {
    expect(isRetryableKind('tile-failure')).toBe(true)
    expect(isRetryableKind('layer-not-found')).toBe(false)
    expect(isRetryableKind('missing-key')).toBe(false)
    expect(MAX_LAYER_RETRIES).toBeLessThanOrEqual(3)
  })

  it('always gives a French message that never leaks the raw service text', () => {
    const error = classifyLayerError({ ...online, status: 500, rawMessage: 'SECRET internal' })
    expect(error.message).not.toMatch(/SECRET/)
    expect(error.message.length).toBeGreaterThan(20)
  })
})
