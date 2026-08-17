import { describe, expect, it } from 'vitest'
import { useMapStore } from './mapStore'

describe('mapStore', () => {
  it('starts with a default view and no assumed GPS position', () => {
    const { view } = useMapStore.getState()
    expect(view.zoom).toBeGreaterThan(0)
    expect(view.pitch).toBe(0)
    expect(view.bearing).toBe(0)
  })

  it('merges partial updates into the existing view', () => {
    const before = useMapStore.getState().view
    useMapStore.getState().setView({ zoom: 12 })
    const after = useMapStore.getState().view

    expect(after.zoom).toBe(12)
    expect(after.center).toEqual(before.center)
  })

  it('clamps terrainExaggeration to [1, 10]', () => {
    useMapStore.getState().setTerrainExaggeration(20)
    expect(useMapStore.getState().terrainExaggeration).toBe(10)

    useMapStore.getState().setTerrainExaggeration(0)
    expect(useMapStore.getState().terrainExaggeration).toBe(1)
  })
})
