import { afterEach, describe, expect, it } from 'vitest'
import { useTerrainToolsStore } from './terrainToolsStore'

const RESET_STATE = {
  mode: 'idle' as const,
  queryResult: null,
  profilePoints: [],
  profileData: null,
}

afterEach(() => {
  useTerrainToolsStore.setState(RESET_STATE)
})

describe('terrainToolsStore', () => {
  it('arms querying mode', () => {
    useTerrainToolsStore.getState().startQuerying()
    expect(useTerrainToolsStore.getState().mode).toBe('querying')
  })

  it('setQueryResult records the result and exits querying mode', () => {
    useTerrainToolsStore.getState().startQuerying()
    const result = {
      coordinate: { lat: 46.8, lng: -71.2 },
      elevationMeters: 312,
      slopeAspect: { slopeDegrees: 5, aspectDegrees: 180 },
    }

    useTerrainToolsStore.getState().setQueryResult(result)

    expect(useTerrainToolsStore.getState().mode).toBe('idle')
    expect(useTerrainToolsStore.getState().queryResult).toEqual(result)
  })

  it('arms profiling mode and accumulates tapped points', () => {
    useTerrainToolsStore.getState().startProfiling()
    useTerrainToolsStore.getState().addProfilePoint({ lat: 46.8, lng: -71.2 })
    useTerrainToolsStore.getState().addProfilePoint({ lat: 46.81, lng: -71.2 })

    expect(useTerrainToolsStore.getState().mode).toBe('profiling')
    expect(useTerrainToolsStore.getState().profilePoints).toHaveLength(2)
  })

  it('removeLastProfilePoint undoes the most recent tap only', () => {
    useTerrainToolsStore.getState().startProfiling()
    useTerrainToolsStore.getState().addProfilePoint({ lat: 46.8, lng: -71.2 })
    useTerrainToolsStore.getState().addProfilePoint({ lat: 46.81, lng: -71.2 })

    useTerrainToolsStore.getState().removeLastProfilePoint()

    expect(useTerrainToolsStore.getState().profilePoints).toEqual([{ lat: 46.8, lng: -71.2 }])
  })

  it('finishProfile stores the data and exits profiling mode, keeping the points', () => {
    useTerrainToolsStore.getState().startProfiling()
    useTerrainToolsStore.getState().addProfilePoint({ lat: 46.8, lng: -71.2 })
    const data = [{ distanceMeters: 0, elevationMeters: 300 }]

    useTerrainToolsStore.getState().finishProfile(data)

    expect(useTerrainToolsStore.getState().mode).toBe('idle')
    expect(useTerrainToolsStore.getState().profileData).toEqual(data)
  })

  it('closeProfile clears both the points and the computed data', () => {
    useTerrainToolsStore.getState().startProfiling()
    useTerrainToolsStore.getState().addProfilePoint({ lat: 46.8, lng: -71.2 })
    useTerrainToolsStore.getState().finishProfile([{ distanceMeters: 0, elevationMeters: 300 }])

    useTerrainToolsStore.getState().closeProfile()

    expect(useTerrainToolsStore.getState().profilePoints).toEqual([])
    expect(useTerrainToolsStore.getState().profileData).toBeNull()
  })

  it('cancel resets everything back to idle', () => {
    useTerrainToolsStore.getState().startProfiling()
    useTerrainToolsStore.getState().addProfilePoint({ lat: 46.8, lng: -71.2 })

    useTerrainToolsStore.getState().cancel()

    const state = useTerrainToolsStore.getState()
    expect(state.mode).toBe('idle')
    expect(state.profilePoints).toEqual([])
    expect(state.queryResult).toBeNull()
  })
})
