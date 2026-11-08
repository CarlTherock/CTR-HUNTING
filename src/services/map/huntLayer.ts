import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { HuntMapOverlay } from '@/features/deer-intel/spatial/overlay'
import { useHuntPresentationStore } from '@/features/deer-intel/state/presentationStore'
export const HUNT_SECTOR_SOURCE_ID = 'hunt-sectors'
export const HUNT_SECTOR_FILL_ID = 'hunt-sectors-fill'
export const HUNT_SECTOR_LINE_ID = 'hunt-sectors-line'
export const HUNT_CANDIDATE_SOURCE_ID = 'hunt-candidates'
export const HUNT_CANDIDATE_CIRCLE_ID = 'hunt-candidates-circle'
export const HUNT_CORRIDOR_SOURCE_ID = 'hunt-corridors'
export const HUNT_CORRIDOR_LINE_ID = 'hunt-corridors-line'
export const HUNT_EXTENT_SOURCE_ID = 'hunt-extent'
export const HUNT_EXTENT_LINE_ID = 'hunt-extent-line'
export const HUNT_SURVEY_SOURCE_ID = 'hunt-survey'
export const HUNT_SURVEY_FILL_ID = 'hunt-survey-fill'
const empty = { type: 'FeatureCollection' as const, features: [] }
export function extentGeoJson(overlay: HuntMapOverlay | null) {
  if (!overlay || overlay.extent.length < 4) return empty
  return { type: 'FeatureCollection' as const, features: [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: overlay.extent.map((p) => [p.lng, p.lat]) } }] }
}
export function createHuntLayer(map: MapLibreMap) {
  let overlay: HuntMapOverlay | null = null, opacity = 0.45
  const visibility = () => {
    const { layers } = useHuntPresentationStore.getState()
    const groups = { survey: [HUNT_SURVEY_FILL_ID], sectors: [HUNT_SECTOR_FILL_ID, HUNT_SECTOR_LINE_ID], candidates: [HUNT_CANDIDATE_CIRCLE_ID], corridors: [HUNT_CORRIDOR_LINE_ID], extent: [HUNT_EXTENT_LINE_ID] }
    for (const key of Object.keys(groups) as (keyof typeof groups)[]) for (const id of groups[key]) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', layers[key] ? 'visible' : 'none')
  }
  const stop = useHuntPresentationStore.subscribe(visibility)
  map.on('remove', stop)
  return {
    addToStyle() {
      map.addSource(HUNT_SURVEY_SOURCE_ID, { type: 'geojson', data: overlay?.survey ?? empty })
      map.addLayer({ id: HUNT_SURVEY_FILL_ID, type: 'fill', source: HUNT_SURVEY_SOURCE_ID, paint: { 'fill-color': ['match', ['get', 'landClass'], 'forest', '#15803d', 'agricultural', '#eab308', 'open', '#fb923c', 'wetland', '#a855f7', 'water', '#0ea5e9', 'developed', '#ef4444', '#64748b'], 'fill-opacity': opacity } })
      map.addSource(HUNT_SECTOR_SOURCE_ID, { type: 'geojson', data: overlay?.sectors ?? empty })
      map.addLayer({ id: HUNT_SECTOR_FILL_ID, type: 'fill', source: HUNT_SECTOR_SOURCE_ID, paint: { 'fill-color': '#22c55e', 'fill-opacity': opacity } })
      map.addLayer({ id: HUNT_SECTOR_LINE_ID, type: 'line', source: HUNT_SECTOR_SOURCE_ID, paint: { 'line-color': '#bbf7d0', 'line-width': 2 } })
      map.addSource(HUNT_EXTENT_SOURCE_ID, { type: 'geojson', data: extentGeoJson(overlay) })
      map.addLayer({ id: HUNT_EXTENT_LINE_ID, type: 'line', source: HUNT_EXTENT_SOURCE_ID, paint: { 'line-color': '#e2e8f0', 'line-width': 1.5, 'line-dasharray': [3, 3] } })
      map.addSource(HUNT_CORRIDOR_SOURCE_ID, { type: 'geojson', data: overlay?.corridors ?? empty })
      map.addLayer({ id: HUNT_CORRIDOR_LINE_ID, type: 'line', source: HUNT_CORRIDOR_SOURCE_ID, paint: { 'line-color': '#f0abfc', 'line-width': ['match', ['get', 'kind'], 'alternative', 2, 3.5], 'line-dasharray': [1.5, 2] } })
      map.addSource(HUNT_CANDIDATE_SOURCE_ID, { type: 'geojson', data: overlay?.candidates ?? empty })
      map.addLayer({ id: HUNT_CANDIDATE_CIRCLE_ID, type: 'circle', source: HUNT_CANDIDATE_SOURCE_ID, paint: { 'circle-radius': ['match', ['get', 'grade'], 'A', 13, 'B', 10, 7], 'circle-color': ['match', ['get', 'grade'], 'A', '#16a34a', 'B', '#ca8a04', '#64748b'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } })
      visibility()
    },
    setOverlay(next: HuntMapOverlay | null, nextOpacity: number) {
      overlay = next; opacity = nextOpacity
      const data = [[HUNT_SURVEY_SOURCE_ID, next?.survey ?? empty], [HUNT_SECTOR_SOURCE_ID, next?.sectors ?? empty], [HUNT_CANDIDATE_SOURCE_ID, next?.candidates ?? empty], [HUNT_CORRIDOR_SOURCE_ID, next?.corridors ?? empty], [HUNT_EXTENT_SOURCE_ID, extentGeoJson(next)]] as const
      for (const [id, value] of data) (map.getSource(id) as GeoJSONSource | undefined)?.setData(value)
      for (const id of [HUNT_SURVEY_FILL_ID, HUNT_SECTOR_FILL_ID]) if (map.getLayer(id)) map.setPaintProperty(id, 'fill-opacity', opacity)
      visibility()
    },
  }
}
