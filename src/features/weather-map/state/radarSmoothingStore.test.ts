import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/database/db'
import { useRadarSmoothingStore } from './radarSmoothingStore'

describe('radarSmoothingStore', () => {
  beforeEach(async () => {
    await db.settings.clear()
    useRadarSmoothingStore.setState({ level: 'doux', loaded: false })
  })

  it('is « Doux » by default', () => {
    expect(useRadarSmoothingStore.getState().level).toBe('doux')
  })

  it('saves the level on the device and restores it', async () => {
    await useRadarSmoothingStore.getState().setLevel('tres-doux')
    expect(useRadarSmoothingStore.getState().level).toBe('tres-doux')
    useRadarSmoothingStore.setState({ level: 'doux', loaded: false })
    await useRadarSmoothingStore.getState().load()
    expect(useRadarSmoothingStore.getState().level).toBe('tres-doux')
    expect(useRadarSmoothingStore.getState().loaded).toBe(true)
  })

  it('reads the earlier on/off switch: off = Précis, anything unknown = Doux', async () => {
    await db.settings.put({ key: 'weatherSmoothing', value: false } as never)
    await useRadarSmoothingStore.getState().load()
    expect(useRadarSmoothingStore.getState().level).toBe('precis')
    await db.settings.put({ key: 'weatherSmoothing', value: 'oui' } as never)
    await useRadarSmoothingStore.getState().load()
    expect(useRadarSmoothingStore.getState().level).toBe('doux')
  })

  it('a slow load never overwrites a choice made meanwhile', async () => {
    await db.settings.put({ key: 'weatherSmoothing', value: 'doux' } as never)
    const loading = useRadarSmoothingStore.getState().load()
    await useRadarSmoothingStore.getState().setLevel('precis')
    await loading
    expect(useRadarSmoothingStore.getState().level).toBe('precis')
  })
})
