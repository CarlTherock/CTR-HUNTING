import { Marker } from 'maplibre-gl'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { Coordinate, Waypoint } from '@/types'
import { isValidCoordinate } from './coordinates'
import {
  createDraftElement,
  createUserLocationElement,
  createWaypointElement,
  renderWaypointElement,
} from './markerElements'

export interface MarkerCallbacks {
  onWaypointClick?: (waypointId: string) => void
  onDraftMove?: (coordinate: Coordinate) => void
}

/** Owns every DOM marker on the map: the "you are here" dot, the saved
 * waypoint pins (diffed by id) and the single draggable draft pin.
 * Coordinates that aren't valid numbers are skipped rather than handed to
 * MapLibre, whose `LngLat` constructor throws on NaN. */
export function createMarkerController(map: MapLibreMap, callbacks: MarkerCallbacks) {
  let userMarker: Marker | null = null
  let draftMarker: Marker | null = null
  const waypointMarkers = new Map<string, Marker>()

  return {
    setUserLocation(coordinate: Coordinate | null) {
      // An unusable fix (NaN/out of range) is treated as "no position":
      // better no dot than a thrown exception or an invented location.
      if (!isValidCoordinate(coordinate)) {
        userMarker?.remove()
        userMarker = null
        return
      }
      if (!userMarker) {
        // Marker.addTo() immediately positions itself from `_lngLat`, so
        // it must be set *before* adding — adding first crashes reading
        // `.lng` off the not-yet-set position.
        userMarker = new Marker({ element: createUserLocationElement() }).setLngLat([
          coordinate.lng,
          coordinate.lat,
        ])
        userMarker.addTo(map)
      } else {
        userMarker.setLngLat([coordinate.lng, coordinate.lat])
      }
    },
    setWaypoints(waypoints: Waypoint[]) {
      const seen = new Set<string>()
      for (const waypoint of waypoints) {
        // A waypoint with an unusable coordinate gets no marker (and any
        // stale one is dropped below) but never blocks the others.
        if (!isValidCoordinate(waypoint.coordinate)) continue
        seen.add(waypoint.id)
        const existing = waypointMarkers.get(waypoint.id)
        if (existing) {
          existing.setLngLat([waypoint.coordinate.lng, waypoint.coordinate.lat])
          // Cheap to re-apply unconditionally (no diffing category/color
          // individually) — this only runs when the waypoint list
          // itself changed, not on every render.
          renderWaypointElement(existing.getElement() as HTMLDivElement, waypoint)
          continue
        }
        const el = createWaypointElement(waypoint)
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          callbacks.onWaypointClick?.(waypoint.id)
        })
        // Never draggable: a saved waypoint's location is locked.
        const marker = new Marker({ element: el, anchor: 'center', draggable: false })
          .setLngLat([waypoint.coordinate.lng, waypoint.coordinate.lat])
          .addTo(map)
        waypointMarkers.set(waypoint.id, marker)
      }
      for (const [id, marker] of waypointMarkers) {
        if (!seen.has(id)) {
          marker.remove()
          waypointMarkers.delete(id)
        }
      }
    },
    setDraft(coordinate: Coordinate | null) {
      if (!coordinate) {
        draftMarker?.remove()
        draftMarker = null
        return
      }
      if (!isValidCoordinate(coordinate)) return
      if (!draftMarker) {
        const marker = new Marker({
          element: createDraftElement(),
          anchor: 'center',
          draggable: true,
        })
          .setLngLat([coordinate.lng, coordinate.lat])
          .addTo(map)
        marker.on('dragend', () => {
          const lngLat = marker.getLngLat()
          callbacks.onDraftMove?.({ lat: lngLat.lat, lng: lngLat.lng })
        })
        draftMarker = marker
      } else {
        draftMarker.setLngLat([coordinate.lng, coordinate.lat])
      }
    },
    destroy() {
      userMarker?.remove()
      draftMarker?.remove()
      for (const marker of waypointMarkers.values()) marker.remove()
      waypointMarkers.clear()
      userMarker = null
      draftMarker = null
    },
  }
}
