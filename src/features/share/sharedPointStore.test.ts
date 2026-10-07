import { afterEach, describe, expect, it } from 'vitest'
import { INVALID_SHARED_LINK_NOTICE, useSharedPointStore } from './sharedPointStore'

afterEach(() => useSharedPointStore.setState({ point: null, notice: null }))

describe('sharedPointStore', () => {
  it('holds a received point in memory and forgets it on dismiss', () => {
    const point = { coordinate: { lat: 46.8, lng: -71.2 }, name: 'Mirador' }
    useSharedPointStore.getState().show(point)
    expect(useSharedPointStore.getState().point).toEqual(point)

    useSharedPointStore.getState().dismiss()
    expect(useSharedPointStore.getState().point).toBeNull()
  })

  it('reports an invalid link with the French notice, and clears it', () => {
    useSharedPointStore.getState().reportInvalid()
    expect(useSharedPointStore.getState().notice).toBe(INVALID_SHARED_LINK_NOTICE)
    expect(INVALID_SHARED_LINK_NOTICE).toBe('Lien de point partagé invalide')

    useSharedPointStore.getState().dismissNotice()
    expect(useSharedPointStore.getState().notice).toBeNull()
  })
})
