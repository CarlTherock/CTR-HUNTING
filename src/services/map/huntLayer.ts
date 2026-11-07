import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { HuntMapOverlay } from '@/features/deer-intel/spatial/overlay'

export const HUNT_SECTOR_SOURCE_ID = 'hunt-sectors'
export const HUNT_SECTOR_FILL_ID = 'hunt-sectors-fill'
export const HUNT_SECTOR_LINE_ID = 'hunt-sectors-line'
export const HUNT_CANDIDATE_SOURCE_ID = 'hunt-candidates'
export const HUNT_CANDIDATE_CIRCLE_ID = 'hunt-candidates-circle'
export const HUNT_CORRIDOR_SOURCE_ID = 'hunt-corridors'
export const HUNT_CORRIDOR_LINE_ID = 'hunt-corridors-line'
export const HUNT_EXTENT_SOURCE_ID = 'hunt-extent'
export const HUNT_EXTENT_LINE_ID = 'hunt-extent-line'

const empty = { type: 'FeatureCollection' as const, features: [] }

export function extentGeoJson(overlay: HuntMapOverlay | null) {
  if (!overlay || overlay.extent.length < 4) return empty
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'LineString' as const,
          coordinates: overlay.extent.map((p) => [p.lng, p.lat]),
        },
      },
    ],
  }
}

/**
 * Couche « Où chasser » : secteurs (contours, transparence réglable), points candidats A/B/C
 * et cercle de l'étendue analysée. Ses propres sources, ré-ajoutées après un changement de
 * fond de carte (`setStyle` les supprime). Présentation seulement : rien n'est enregistré.
 */
export function createHuntLayer(map: MapLibreMap) {
  let overlay: HuntMapOverlay | null = null
  let opacity = 0.45

  return {
    addToStyle() {
      map.addSource(HUNT_SECTOR_SOURCE_ID, {
        type: 'geojson',
        data: overlay?.sectors ?? empty,
      })
      map.addLayer({
        id: HUNT_SECTOR_FILL_ID,
        type: 'fill',
        source: HUNT_SECTOR_SOURCE_ID,
        paint: { 'fill-color': '#22c55e', 'fill-opacity': opacity },
      })
      map.addLayer({
        id: HUNT_SECTOR_LINE_ID,
        type: 'line',
        source: HUNT_SECTOR_SOURCE_ID,
        paint: { 'line-color': '#bbf7d0', 'line-width': 2 },
      })
      map.addSource(HUNT_EXTENT_SOURCE_ID, {
        type: 'geojson',
        data: extentGeoJson(overlay),
      })
      map.addLayer({
        id: HUNT_EXTENT_LINE_ID,
        type: 'line',
        source: HUNT_EXTENT_SOURCE_ID,
        paint: { 'line-color': '#e2e8f0', 'line-width': 1.5, 'line-dasharray': [3, 3] },
      })
      map.addSource(HUNT_CORRIDOR_SOURCE_ID, {
        type: 'geojson',
        data: overlay?.corridors ?? empty,
      })
      map.addLayer({
        id: HUNT_CORRIDOR_LINE_ID,
        type: 'line',
        source: HUNT_CORRIDOR_SOURCE_ID,
        // Pointillé : hypothèse de connectivité, pas une piste observée ; alternative plus fine.
        paint: {
          'line-color': '#f0abfc',
          'line-width': ['match', ['get', 'kind'], 'alternative', 2, 3.5],
          'line-dasharray': [1.5, 2],
        },
      })
      map.addSource(HUNT_CANDIDATE_SOURCE_ID, {
        type: 'geojson',
        data: overlay?.candidates ?? empty,
      })
      map.addLayer({
        id: HUNT_CANDIDATE_CIRCLE_ID,
        type: 'circle',
        source: HUNT_CANDIDATE_SOURCE_ID,
        paint: {
          // Rang A plus gros que B, B plus gros que C : le rang ne repose pas sur la couleur seule
          // (la lettre et le score sont dans la liste de l'onglet OÙ).
          'circle-radius': ['match', ['get', 'grade'], 'A', 13, 'B', 10, 7],
          'circle-color': [
            'match',
            ['get', 'grade'],
            'A',
            '#16a34a',
            'B',
            '#ca8a04',
            '#64748b',
          ],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      })
    },
    setOverlay(next: HuntMapOverlay | null, nextOpacity: number) {
      overlay = next
      opacity = nextOpacity
      const sectors = map.getSource(HUNT_SECTOR_SOURCE_ID) as GeoJSONSource | undefined
      sectors?.setData(next?.sectors ?? empty)
      const cands = map.getSource(HUNT_CANDIDATE_SOURCE_ID) as GeoJSONSource | undefined
      cands?.setData(next?.candidates ?? empty)
      const cor = map.getSource(HUNT_CORRIDOR_SOURCE_ID) as GeoJSONSource | undefined
      cor?.setData(next?.corridors ?? empty)
      const ext = map.getSource(HUNT_EXTENT_SOURCE_ID) as GeoJSONSource | undefined
      ext?.setData(extentGeoJson(next))
      if (map.getLayer(HUNT_SECTOR_FILL_ID))
        map.setPaintProperty(HUNT_SECTOR_FILL_ID, 'fill-opacity', nextOpacity)
    },
  }
}
