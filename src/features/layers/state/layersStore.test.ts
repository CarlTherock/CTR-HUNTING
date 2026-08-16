import { afterEach, describe, expect, it } from 'vitest'
import { useLayersStore } from './layersStore'

describe('layersStore', () => {
  afterEach(() => {
    useLayersStore.setState({ baseLayer: 'outdoor' })
  })

  it('defaults to the outdoor base layer', () => {
    expect(useLayersStore.getState().baseLayer).toBe('outdoor')
  })

  it('switches the active base layer', () => {
    useLayersStore.getState().setBaseLayer('satellite')
    expect(useLayersStore.getState().baseLayer).toBe('satellite')
  })
})
