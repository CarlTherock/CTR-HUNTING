import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { Waypoint } from '@/types'

const { markers, FakeMarker } = vi.hoisted(() => {
  const markers: InstanceType<typeof FakeMarker>[] = []
  class FakeMarker {
    lngLat: [number, number] | undefined
    element: HTMLElement | undefined
    removed = false
    constructor(options?: { element?: HTMLElement }) {
      this.element = options?.element
      markers.push(this)
    }
    // Same contract as MapLibre's LngLat constructor, which Marker.setLngLat
    // goes through: NaN throws.
    setLngLat(lngLat: [number, number]) {
      if (Number.isNaN(lngLat[0]) || Number.isNaN(lngLat[1])) {
        throw new Error('Invalid LngLat object: (NaN, NaN)')
      }
      this.lngLat = lngLat
      return this
    }
    getLngLat() {
      return { lng: this.lngLat?.[0] ?? 0, lat: this.lngLat?.[1] ?? 0 }
    }
    getElement() {
      return this.element
    }
    addTo() {
      return this
    }
    on() {
      return this
    }
    remove() {
      this.removed = true
      return this
    }
  }
  return { markers, FakeMarker }
})

vi.mock('maplibre-gl', () => ({ Marker: FakeMarker }))

import { createMarkerController } from './markerController'

function waypoint(id: string, lat: number, lng: number): Waypoint {
  return {
    id,
    name: id,
    coordinate: { lat, lng },
    category: 'general',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

const map = {} as MapLibreMap

describe('createMarkerController', () => {
  beforeEach(() => {
    markers.length = 0
  })

  it('skips a waypoint with an invalid coordinate without blocking the valid ones', () => {
    const controller = createMarkerController(map, {})

    expect(() =>
      controller.setWaypoints([
        waypoint('a', 1, 1),
        waypoint('bad', Number.NaN, 2),
        waypoint('c', 3, 3),
      ]),
    ).not.toThrow()

    expect(markers.map((m) => m.lngLat)).toEqual([
      [1, 1],
      [3, 3],
    ])
  })

  it('drops the marker of a waypoint whose coordinate became invalid', () => {
    const controller = createMarkerController(map, {})
    controller.setWaypoints([waypoint('a', 1, 1)])

    expect(() => controller.setWaypoints([waypoint('a', Number.NaN, 1)])).not.toThrow()

    expect(markers[0].removed).toBe(true)
  })

  it('treats an unusable GPS fix as "no position" instead of throwing', () => {
    const controller = createMarkerController(map, {})
    controller.setUserLocation({ lat: 46.8, lng: -71.2 })

    expect(() =>
      controller.setUserLocation({ lat: Number.NaN, lng: Number.NaN }),
    ).not.toThrow()

    expect(markers).toHaveLength(1)
    expect(markers[0].removed).toBe(true)
  })

  it('ignores an invalid draft coordinate', () => {
    const controller = createMarkerController(map, {})
    expect(() => controller.setDraft({ lat: Number.NaN, lng: 0 })).not.toThrow()
    expect(markers).toHaveLength(0)
  })
})
