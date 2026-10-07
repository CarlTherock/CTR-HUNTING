import { Marker } from 'maplibre-gl'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { Coordinate, Waypoint } from '@/types'
import { isValidCoordinate } from './coordinates'
import {
  createDraftElement,
  createSharedPointElement,
  createUserLocationElement,
  createWaypointElement,
  renderWaypointElement,
} from './markerElements'

export interface MarkerCallbacks {
  onWaypointClick?: (waypointId: string) => void
  onDraftMove?: (coordinate: Coordinate) => void
}

/** Owns every DOM marker on the map: the "you are here" dot, the saved
 * waypoint pins (diffed by id), the single draggable draft pin and the
 * non-draggable preview of a shared point.
 * Coordinates that aren't valid numbers are skipped rather than handed to
 * MapLibre, whose `LngLat` constructor throws on NaN. */
export function createMarkerController(map: MapLibreMap, callbacks: MarkerCallbacks) {
  let userMarker: Marker | null = null
  let draftMarker: Marker | null = null
  let sharedMarker: Marker | null = null
  let sharedKey: string | null = null
  const waypointMarkers = new Map<string, Marker>()
  const waypointData = new Map<string, Waypoint>()
  let selectedId: string | null = null

  function paint(id: string) {
    const marker = waypointMarkers.get(id)
    const data = waypointData.get(id)
    if (!marker || !data) return
    renderWaypointElement(marker.getElement() as HTMLDivElement, data, id === selectedId)
  }

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
          waypointData.set(waypoint.id, waypoint)
          paint(waypoint.id)
          continue
        }
        const el = createWaypointElement(waypoint, waypoint.id === selectedId)
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          callbacks.onWaypointClick?.(waypoint.id)
        })
        // Never draggable: a saved waypoint's location is locked.
        const marker = new Marker({ element: el, anchor: 'center', draggable: false })
          .setLngLat([waypoint.coordinate.lng, waypoint.coordinate.lat])
          .addTo(map)
        waypointMarkers.set(waypoint.id, marker)
        waypointData.set(waypoint.id, waypoint)
      }
      for (const [id, marker] of waypointMarkers) {
        if (!seen.has(id)) {
          marker.remove()
          waypointMarkers.delete(id)
          waypointData.delete(id)
        }
      }
    },
    /** Highlights one saved waypoint (or none, with `null`). Presentation
     * only: no coordinate is touched and every marker stays clickable. The
     * choice is remembered, so it applies as soon as that marker exists. */
    setSelectedWaypoint(id: string | null) {
      if (id === selectedId) return
      const previous = selectedId
      selectedId = id
      if (previous) paint(previous)
      if (id) paint(id)
    },
    /** Preview of a point received through a shared link. Not a waypoint,
     * not draggable, never persisted. `null` (or an unusable coordinate)
     * removes it. */
    setSharedPoint(coordinate: Coordinate | null, name: string) {
      if (!isValidCoordinate(coordinate)) {
        sharedMarker?.remove()
        sharedMarker = null
        sharedKey = null
        return
      }
      const key = `${coordinate.lat},${coordinate.lng}|${name}`
      if (sharedMarker && key === sharedKey) return
      sharedMarker?.remove()
      sharedMarker = new Marker({
        element: createSharedPointElement(name),
        anchor: 'center',
        draggable: false,
      })
        .setLngLat([coordinate.lng, coordinate.lat])
        .addTo(map)
      sharedKey = key
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
      sharedMarker?.remove()
      for (const marker of waypointMarkers.values()) marker.remove()
      waypointMarkers.clear()
      waypointData.clear()
      userMarker = null
      draftMarker = null
      sharedMarker = null
      sharedKey = null
    },
  }
}
