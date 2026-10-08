import { describe, expect, it } from 'vitest'
import { FOREST_LAYER_OPTIONS, forestLayerOption } from '@/services/map/forestLayerTiles'
import { enabledAttributions, layerNotice } from './layerNotices'

describe('layerNotice', () => {
  const ombre = forestLayerOption('lidar-ombre')
  const cadastre = forestLayerOption('cadastre')

  it('shows the load error, whatever the zoom', () => {
    const notice = layerNotice(ombre, { state: 'error', message: 'Service bloqué' }, 5)
    expect(notice).toEqual({ tone: 'error', text: 'Service bloqué' })
  })

  it('falls back to a generic error text when the engine gave none', () => {
    expect(layerNotice(cadastre, { state: 'error' }, 12)?.text).toMatch(/impossible/)
  })

  it('tells the user to zoom in when the service draws nothing at this zoom', () => {
    const notice = layerNotice(ombre, { state: 'ready' }, 6)
    expect(notice?.tone).toBe('warning')
    expect(notice?.text).toMatch(/zoom 9/)
    expect(layerNotice(ombre, { state: 'ready' }, 9)?.tone).toBe('info')
  })

  it('reports loading and loaded states, and nothing before any status', () => {
    expect(layerNotice(cadastre, { state: 'loading' }, 12)?.text).toBe('Chargement…')
    expect(layerNotice(cadastre, { state: 'ready' }, 12)?.text).toBe('Chargée.')
    expect(layerNotice(cadastre, undefined, 12)).toBeNull()
  })
})

describe('enabledAttributions', () => {
  it('lists the attribution of each enabled layer once, and none when nothing is on', () => {
    expect(enabledAttributions(FOREST_LAYER_OPTIONS, {})).toEqual([])
    const both = enabledAttributions(FOREST_LAYER_OPTIONS, {
      'lidar-ombre': true,
      'lidar-acquisition': true,
      'aires-protegees': true,
    })
    expect(both).toHaveLength(2)
    expect(both[0]).toMatch(/LiDAR/)
    expect(both[1]).toMatch(/Registre des aires protégées/)
  })
})
