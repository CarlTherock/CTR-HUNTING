import { describe, expect, it } from 'vitest'
import { forestLayerTileUrl } from './forestLayerTiles'

describe('forestLayerTileUrl', () => {
  it('builds a real ArcGIS export URL for the cadastre layer, with the {bbox-epsg-3857} token intact', () => {
    const url = forestLayerTileUrl('cadastre')
    expect(url).toContain(
      'https://geo.environnement.gouv.qc.ca/donnees/rest/services/Reference/Cadastre_allege/MapServer/export',
    )
    expect(url).toContain('bbox={bbox-epsg-3857}')
    expect(url).toContain('layers=show:0')
  })

  it('builds a real WMS GetMap URL for the coupes-forestières (interventions) layer', () => {
    const url = forestLayerTileUrl('coupes-forestieres')
    expect(url).toContain('https://geoegl.msp.gouv.qc.ca/ws/mffpecofor.fcgi')
    expect(url).toContain('LAYERS=ori_pee_interventions')
    expect(url).toContain('SERVICE=WMS')
    expect(url).toContain('&BBOX={bbox-epsg-3857}')
  })

  it('builds a real WMS GetMap URL for the peuplements-ecoforestiers layer', () => {
    const url = forestLayerTileUrl('peuplements-ecoforestiers')
    expect(url).toContain('LAYERS=ori_pee_ori_prov')
  })

  it("never URL-encodes the {bbox-epsg-3857} token, which would break MapLibre's substitution", () => {
    for (const id of [
      'cadastre',
      'coupes-forestieres',
      'peuplements-ecoforestiers',
    ] as const) {
      expect(forestLayerTileUrl(id)).not.toContain('%7Bbbox')
    }
  })
})
