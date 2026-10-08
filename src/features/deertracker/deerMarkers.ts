import type { Observation, Waypoint, WaypointColor } from '@/types'
import { DEER_KIND_LABEL } from './deerLogic'

const KIND_COLOR: Record<string, WaypointColor> = {
  sighting: '#22c55e',
  track: '#f59e0b',
  scrape: '#a855f7',
  rub: '#3b82f6',
  other_sign: '#64748b',
}

/** Display-only markers: the entries are shown, never turned into waypoints. */
export function toDisplayMarkers(entries: readonly Observation[]): Waypoint[] {
  return entries
    .filter((o) => o.deer)
    .map((o) => ({
      id: o.id,
      name: o.deer ? DEER_KIND_LABEL[o.deer.kind] : 'Observation',
      coordinate: o.coordinate,
      category: 'game_sign' as const,
      color: KIND_COLOR[o.deer?.kind ?? 'other_sign'],
      createdAt: o.timestamp,
      updatedAt: o.timestamp,
    }))
}
