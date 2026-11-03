import { afterEach, describe, expect, it } from 'vitest'
import { db } from '@/database/db'
import { DEFAULT_WIND_STYLE } from '@/utils/windStyle'
import { useWindStyleStore } from './windStyleStore'

afterEach(async () => {
  await db.settings.clear()
  useWindStyleStore.setState({ style: DEFAULT_WIND_STYLE, loaded: false })
})

describe('windStyleStore', () => {
  it('applies a change at once and saves it on the device', async () => {
    await useWindStyleStore.getState().update({ size: 'xlarge', contrast: true })
    expect(useWindStyleStore.getState().style).toEqual({
      ...DEFAULT_WIND_STYLE,
      size: 'xlarge',
      contrast: true,
    })
    expect((await db.settings.get('windStyle'))?.value).toEqual({
      ...DEFAULT_WIND_STYLE,
      size: 'xlarge',
      contrast: true,
    })
  })

  it('restores the saved style after a restart, with no network involved', async () => {
    await db.settings.put({
      key: 'windStyle',
      value: { size: 'large', thickness: 'thick', density: 'low', contrast: true },
    })
    await useWindStyleStore.getState().load()
    expect(useWindStyleStore.getState().style).toEqual({
      size: 'large',
      thickness: 'thick',
      density: 'low',
      contrast: true,
    })
    expect(useWindStyleStore.getState().loaded).toBe(true)
  })

  it('falls back on the defaults for a corrupted record', async () => {
    await db.settings.put({ key: 'windStyle', value: 'oops' })
    await useWindStyleStore.getState().load()
    expect(useWindStyleStore.getState().style).toEqual(DEFAULT_WIND_STYLE)
  })

  it('a change made while load() is reading is not overwritten', async () => {
    const loading = useWindStyleStore.getState().load()
    await useWindStyleStore.getState().update({ density: 'high' })
    await loading
    expect(useWindStyleStore.getState().style.density).toBe('high')
  })
})
