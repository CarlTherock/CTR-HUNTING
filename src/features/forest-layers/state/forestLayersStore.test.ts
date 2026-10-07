import { afterEach, describe, expect, it } from 'vitest'
import { effectiveOpacity, useForestLayersStore } from './forestLayersStore'

afterEach(() => {
  useForestLayersStore.setState({
    enabled: {},
    opacity: 0.65,
    layerOpacity: {},
    status: {},
  })
})

describe('forestLayersStore', () => {
  it('toggle(id) flips just that one layer, independent of the others', () => {
    useForestLayersStore.getState().toggle('cadastre')
    expect(useForestLayersStore.getState().enabled).toEqual({ cadastre: true })

    useForestLayersStore.getState().toggle('coupes-forestieres')
    expect(useForestLayersStore.getState().enabled).toEqual({
      cadastre: true,
      'coupes-forestieres': true,
    })

    useForestLayersStore.getState().toggle('cadastre')
    expect(useForestLayersStore.getState().enabled).toEqual({
      cadastre: false,
      'coupes-forestieres': true,
    })
  })

  it('setOpacity clamps to 0-1', () => {
    useForestLayersStore.getState().setOpacity(1.4)
    expect(useForestLayersStore.getState().opacity).toBe(1)

    useForestLayersStore.getState().setOpacity(-0.3)
    expect(useForestLayersStore.getState().opacity).toBe(0)
  })
})

describe('per-layer opacity and load status', () => {
  it('a layer without its own opacity follows the default; one with its own value keeps it', () => {
    useForestLayersStore.getState().setLayerOpacity('lidar-ombre', 0.3)
    useForestLayersStore.getState().setOpacity(0.8)
    const state = useForestLayersStore.getState()
    expect(effectiveOpacity(state, 'lidar-ombre')).toBe(0.3)
    expect(effectiveOpacity(state, 'cadastre')).toBe(0.8)
  })

  it('setLayerOpacity clamps to 0-1', () => {
    useForestLayersStore.getState().setLayerOpacity('cadastre', 3)
    expect(useForestLayersStore.getState().layerOpacity.cadastre).toBe(1)
  })

  it('records the load status of each layer independently', () => {
    useForestLayersStore.getState().setStatus('cadastre', { state: 'ready' })
    useForestLayersStore
      .getState()
      .setStatus('lidar-ombre', { state: 'error', message: 'x' })
    expect(useForestLayersStore.getState().status).toEqual({
      cadastre: { state: 'ready' },
      'lidar-ombre': { state: 'error', message: 'x' },
    })
  })
})
