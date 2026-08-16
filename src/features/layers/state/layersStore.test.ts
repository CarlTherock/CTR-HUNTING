import { afterEach, describe, expect, it } from 'vitest'
import { useLayersStore } from './layersStore'

const DEFAULT_OVERLAYS = { trails: true, hydrography: true, contours: true }

describe('layersStore', () => {
  afterEach(() => {
    useLayersStore.setState({ baseLayer: 'outdoor', overlays: DEFAULT_OVERLAYS })
  })

  it('defaults to the outdoor base layer', () => {
    expect(useLayersStore.getState().baseLayer).toBe('outdoor')
  })

  it('switches the active base layer', () => {
    useLayersStore.getState().setBaseLayer('satellite')
    expect(useLayersStore.getState().baseLayer).toBe('satellite')
  })

  it('defaults every overlay to visible', () => {
    expect(useLayersStore.getState().overlays).toEqual(DEFAULT_OVERLAYS)
  })

  it('toggles a single overlay without affecting the others', () => {
    useLayersStore.getState().toggleOverlay('contours')
    expect(useLayersStore.getState().overlays).toEqual({
      trails: true,
      hydrography: true,
      contours: false,
    })

    useLayersStore.getState().toggleOverlay('contours')
    expect(useLayersStore.getState().overlays).toEqual(DEFAULT_OVERLAYS)
  })
})
