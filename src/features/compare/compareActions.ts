import { useGuidanceStore } from '@/features/guidance/state/guidanceStore'
import { useJournalStore } from '@/features/journal/state/journalStore'
import { useMapStore } from '@/features/map/state/mapStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import type { Coordinate } from '@/types'

/** Zoom minimal quand on centre la carte sur un point de repère. */
export const VIEW_ON_MAP_MIN_ZOOM = 15

export type Navigate = (to: string) => void

/**
 * Actions du comparateur. Elles passent toutes par les mécanismes
 * existants et ne modifient JAMAIS un point de repère : « Voir sur la
 * carte » règle la vue partagée de la carte (comme le Journal) ;
 * « Aller à » démarre le guidage existant (qui ne lit que l'id) ;
 * « Ouvrir la fiche » ouvre la fiche existante, dont la position reste
 * verrouillée.
 */

/** Centre la carte sur un point (sans toucher à ses coordonnées) puis ouvre /map. */
export function viewWaypointOnMap(waypointId: string, navigate: Navigate): boolean {
  const waypoint = useWaypointsStore.getState().waypoints.find((w) => w.id === waypointId)
  if (!waypoint) return false
  const center: Coordinate = {
    lat: waypoint.coordinate.lat,
    lng: waypoint.coordinate.lng,
  }
  const zoom = Math.max(useMapStore.getState().view.zoom, VIEW_ON_MAP_MIN_ZOOM)
  useMapStore.getState().setView({ center, zoom })
  navigate('/map')
  return true
}

/** Démarre « Aller à » vers ce point puis ouvre la carte (où le panneau de guidage s'affiche). */
export function startGuidanceTo(waypointId: string, navigate: Navigate): boolean {
  if (!useGuidanceStore.getState().start(waypointId)) return false
  navigate('/map')
  return true
}

/** Ouvre la fiche existante du point (nom, notes, vent… ; position verrouillée). */
export function openWaypointSheet(waypointId: string): void {
  useWaypointsStore.getState().selectWaypoint(waypointId)
}

/** Ouvre une entrée de journal dans la page Journal. */
export function openJournalEntry(observationId: string, navigate: Navigate): void {
  useJournalStore.getState().select(observationId)
  navigate('/journal')
}
