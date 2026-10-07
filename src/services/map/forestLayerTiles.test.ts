import { describe, expect, it } from 'vitest'
import {
  AIRES_PROTEGEES_LAYER_ID,
  FOREST_LAYER_OPTIONS,
  OFFICIAL_HUNTING_LINKS,
  TRQ_FAUNE_LAYER_IDS,
  TRQ_PARCS_LAYER_IDS,
  WARNING_FRONTIERE,
  forestLayerOption,
  forestLayerTileUrl,
} from './forestLayerTiles'
import { buildCsp } from '../../../build/csp'

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

  it('uses the exact layer names read from the current Forêt ouverte GetCapabilities for the LiDAR layers', () => {
    const ombre = forestLayerTileUrl('lidar-ombre')
    expect(ombre).toContain('https://geoegl.msp.gouv.qc.ca/ws/mffpecofor.fcgi?')
    expect(ombre).toContain('LAYERS=lidar_ombre')
    expect(ombre).toContain('SRS=EPSG%3A3857')
    expect(ombre).toContain('TRANSPARENT=TRUE')
    expect(ombre).toContain('&BBOX={bbox-epsg-3857}')

    expect(forestLayerTileUrl('lidar-acquisition')).toContain(
      'LAYERS=lidar_index_acquisition',
    )
  })

  it('builds ArcGIS export URLs for the TRQ layers with the verified layer ids', () => {
    const faune = forestLayerTileUrl('trq-faune')
    expect(faune).toContain(
      'https://servicescarto.mrnf.gouv.qc.ca/pes/rest/services/Territoire/TRQ_WMS/MapServer/export?',
    )
    expect(faune).toContain('bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857')
    // 0 aire faunique communautaire, 8 pourvoirie, 9-12 refuges/réserves,
    // 15 territoire exclusif de chasse, 16 ZEC.
    expect(faune.endsWith('layers=show:0,8,9,10,11,12,15,16')).toBe(true)
    expect([...TRQ_FAUNE_LAYER_IDS]).toEqual([0, 8, 9, 10, 11, 12, 15, 16])

    const parcs = forestLayerTileUrl('trq-parcs')
    expect(parcs.endsWith('layers=show:3,4,5,6,13')).toBe(true)
    expect([...TRQ_PARCS_LAYER_IDS]).toEqual([3, 4, 5, 6, 13])
  })

  it('builds an ArcGIS export URL for the aires protégées layer 23', () => {
    const url = forestLayerTileUrl('aires-protegees')
    expect(url).toContain(
      'https://geo.environnement.gouv.qc.ca/donnees/rest/services/Biodiversite/Aires_protegees/MapServer/export?',
    )
    expect(url.endsWith(`layers=show:${AIRES_PROTEGEES_LAYER_ID}`)).toBe(true)
    expect(AIRES_PROTEGEES_LAYER_ID).toBe(23)
  })

  it("never URL-encodes the {bbox-epsg-3857} token, which would break MapLibre's substitution", () => {
    for (const option of FOREST_LAYER_OPTIONS) {
      const url = forestLayerTileUrl(option.id)
      expect(url).not.toContain('%7Bbbox')
      expect(url).toContain('{bbox-epsg-3857}')
    }
  })

  it('only targets hosts the production CSP allows', () => {
    const csp = buildCsp()
    const imgSrc = csp.split('; ').find((d) => d.startsWith('img-src ')) ?? ''
    const connectSrc = csp.split('; ').find((d) => d.startsWith('connect-src ')) ?? ''
    for (const option of FOREST_LAYER_OPTIONS) {
      const origin = new URL(forestLayerTileUrl(option.id)).origin
      expect(imgSrc).toContain(origin)
      expect(connectSrc).toContain(origin)
    }
  })
})

describe('FOREST_LAYER_OPTIONS metadata', () => {
  it('gives every layer an attribution, a licence, a data note and an https source link', () => {
    for (const option of FOREST_LAYER_OPTIONS) {
      expect(option.attribution).toMatch(/Gouvernement du Québec/)
      expect(option.license).toMatch(/CC-BY/)
      expect(option.dataNote.length).toBeGreaterThan(20)
      expect(option.sourceUrl).toMatch(/^https:\/\//)
    }
  })

  it('has unique ids', () => {
    const ids = FOREST_LAYER_OPTIONS.map((option) => option.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('flags every territory / protected-area layer as a legal boundary, and nothing else', () => {
    const legal = FOREST_LAYER_OPTIONS.filter((option) => option.legalBoundary).map(
      (option) => option.id,
    )
    expect(legal.sort()).toEqual(['aires-protegees', 'trq-faune', 'trq-parcs'])
    for (const option of FOREST_LAYER_OPTIONS) {
      expect(option.group === 'frontieres').toBe(!!option.legalBoundary)
    }
  })

  it('does not promise freshness or resolution the source does not publish', () => {
    const ombre = forestLayerOption('lidar-ombre')
    expect(ombre.dataNote).toMatch(/pas garantie à jour/)
    expect(ombre.dataNote).toMatch(/dégradé/)
    expect(ombre.minZoom).toBe(9)
    for (const option of FOREST_LAYER_OPTIONS) {
      expect(option.dataNote).not.toMatch(/\bà jour en temps réel\b/)
    }
  })

  it('states the boundary warning verbatim and links official hunting information', () => {
    expect(WARNING_FRONTIERE).toBe(
      'Une frontière ne prouve pas un droit de chasse : l’accès, les saisons, l’espèce et les restrictions sont distincts.',
    )
    expect(OFFICIAL_HUNTING_LINKS.length).toBeGreaterThanOrEqual(2)
    for (const link of OFFICIAL_HUNTING_LINKS) {
      expect(link.href).toMatch(/^https:\/\/www\.quebec\.ca\//)
    }
  })

  it('throws for an unknown id rather than returning undefined metadata', () => {
    expect(() => forestLayerOption('inconnue' as never)).toThrow()
  })
})
