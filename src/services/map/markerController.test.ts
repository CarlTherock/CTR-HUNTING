import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { Waypoint } from '@/types'

const { markers, FakeMarker } = vi.hoisted(() => {
  const markers: InstanceType<typeof FakeMarker>[] = []
  class FakeMarker {
    lngLat: [number, number] | undefined
    element: HTMLElement | undefined
    removed = false
    rotation: number | undefined
    constructor(options?: { element?: HTMLElement }) {
      this.element = options?.element
      markers.push(this)
    }
    setRotation(rotation: number) {
      this.rotation = rotation
      return this
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

  describe('device marker direction cone', () => {
    const cone = () =>
      markers[0].element?.querySelector<HTMLElement>('[data-testid="user-heading-cone"]')

    it('is a blue dot whose cone stays hidden without a heading', () => {
      const controller = createMarkerController(map, {})
      controller.setUserLocation({ lat: 46.8, lng: -71.2 })
      expect(markers[0].element?.style.background).toMatch(/#2563eb|rgb\(37, 99, 235\)/)
      expect(cone()?.style.display).toBe('none')
      expect(markers[0].rotation).toBeUndefined()
    })

    it('shows the cone rotated by the TRUE heading (normalized) and hides it with null', () => {
      const controller = createMarkerController(map, {})
      controller.setUserLocation({ lat: 46.8, lng: -71.2 })
      controller.setUserHeading(-10)
      expect(cone()?.style.display).toBe('block')
      expect(markers[0].rotation).toBe(350)
      controller.setUserHeading(null)
      expect(cone()?.style.display).toBe('none')
      controller.setUserHeading(Number.NaN)
      expect(cone()?.style.display).toBe('none')
    })

    it('remembers a heading set before the marker exists', () => {
      const controller = createMarkerController(map, {})
      controller.setUserHeading(90)
      controller.setUserLocation({ lat: 46.8, lng: -71.2 })
      expect(cone()?.style.display).toBe('block')
      expect(markers[0].rotation).toBe(90)
    })
  })

  it('ignores an invalid draft coordinate', () => {
    const controller = createMarkerController(map, {})
    expect(() => controller.setDraft({ lat: Number.NaN, lng: 0 })).not.toThrow()
    expect(markers).toHaveLength(0)
  })

  describe('selected waypoint highlight', () => {
    function elementOf(index: number): HTMLElement {
      const el = markers[index].element
      if (!el) throw new Error('marker without element')
      return el
    }

    it('highlights only the selected marker, without moving it', () => {
      const controller = createMarkerController(map, {})
      controller.setWaypoints([waypoint('a', 1, 1), waypoint('b', 2, 2)])
      const sizeBefore = elementOf(0).style.width

      controller.setSelectedWaypoint('a')

      expect(elementOf(0).getAttribute('data-selected')).toBe('true')
      expect(elementOf(1).hasAttribute('data-selected')).toBe(false)
      expect(parseInt(elementOf(0).style.width)).toBeGreaterThan(parseInt(sizeBefore))
      expect(elementOf(0).style.boxShadow).toContain('#0ea5e9')
      // Position untouched.
      expect(markers[0].lngLat).toEqual([1, 1])
      expect(markers[1].lngLat).toEqual([2, 2])
    })

    it('moves the highlight when another waypoint is selected and clears it with null', () => {
      const controller = createMarkerController(map, {})
      controller.setWaypoints([waypoint('a', 1, 1), waypoint('b', 2, 2)])

      controller.setSelectedWaypoint('a')
      controller.setSelectedWaypoint('b')
      expect(elementOf(0).hasAttribute('data-selected')).toBe(false)
      expect(elementOf(1).getAttribute('data-selected')).toBe('true')

      controller.setSelectedWaypoint(null)
      expect(elementOf(1).hasAttribute('data-selected')).toBe(false)
      expect(elementOf(1).style.width).toBe(elementOf(0).style.width)
    })

    it('keeps the highlight across list refreshes and applies it to a marker created later', () => {
      const controller = createMarkerController(map, {})
      controller.setSelectedWaypoint('late')
      controller.setWaypoints([waypoint('a', 1, 1)])
      expect(elementOf(0).hasAttribute('data-selected')).toBe(false)

      controller.setWaypoints([waypoint('a', 1, 1), waypoint('late', 3, 3)])
      expect(elementOf(1).getAttribute('data-selected')).toBe('true')

      controller.setWaypoints([waypoint('a', 1, 1), waypoint('late', 3, 3)])
      expect(elementOf(1).getAttribute('data-selected')).toBe('true')
    })

    it('keeps a 44 px touch target on every marker, and clicks still reach the callback', () => {
      const onWaypointClick = vi.fn()
      const controller = createMarkerController(map, { onWaypointClick })
      controller.setWaypoints([waypoint('a', 1, 1), waypoint('b', 2, 2)])
      controller.setSelectedWaypoint('a')

      for (const index of [0, 1]) {
        const hit = elementOf(index).querySelector<HTMLElement>('[data-hit-area]')
        expect(hit?.style.width).toBe('44px')
        expect(hit?.style.height).toBe('44px')
      }
      elementOf(1).click()
      expect(onWaypointClick).toHaveBeenCalledWith('b')
    })
  })

  describe('shared point preview', () => {
    it('shows a non-draggable preview marker that is not a waypoint', () => {
      const controller = createMarkerController(map, {})
      controller.setSharedPoint({ lat: 46.8, lng: -71.2 }, 'Mirador')

      expect(markers).toHaveLength(1)
      expect(markers[0].lngLat).toEqual([-71.2, 46.8])
      expect(markers[0].element?.getAttribute('data-testid')).toBe('shared-point-marker')
      expect(markers[0].element?.getAttribute('aria-label')).toContain('Mirador')
    })

    it('renders the name as text only, never as HTML', () => {
      const controller = createMarkerController(map, {})
      controller.setSharedPoint({ lat: 1, lng: 2 }, '<img src=x onerror=alert(1)>')
      const el = markers[0].element
      expect(el?.querySelector('img')).toBeNull()
      expect(el?.innerHTML).not.toContain('<img')
    })

    it('replaces the preview when the point changes and removes it with null', () => {
      const controller = createMarkerController(map, {})
      controller.setSharedPoint({ lat: 1, lng: 2 }, 'A')
      controller.setSharedPoint({ lat: 1, lng: 2 }, 'A')
      expect(markers).toHaveLength(1)

      controller.setSharedPoint({ lat: 3, lng: 4 }, 'B')
      expect(markers).toHaveLength(2)
      expect(markers[0].removed).toBe(true)

      controller.setSharedPoint(null, '')
      expect(markers[1].removed).toBe(true)
    })

    it('ignores an unusable coordinate', () => {
      const controller = createMarkerController(map, {})
      expect(() =>
        controller.setSharedPoint({ lat: Number.NaN, lng: 0 }, 'x'),
      ).not.toThrow()
      expect(markers).toHaveLength(0)
    })
  })
})
