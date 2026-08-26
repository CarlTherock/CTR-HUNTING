import { afterEach, describe, expect, it } from 'vitest'
import { useForestLayersStore } from './forestLayersStore'

afterEach(() => {
  useForestLayersStore.setState({ enabled: {}, opacity: 0.65 })
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
