import {
  Camera,
  Car,
  DoorOpen,
  Droplet,
  Footprints,
  MapPin,
  Moon,
  Signpost,
  Star,
  Target,
  Tent,
  TreePine,
  TriangleAlert,
  Wheat,
} from 'lucide-react'
import type { WaypointCategory, WaypointColor } from '@/types'

/** Shared between `WaypointEditPanel` (the picker) and `WaypointsPage` (the
 * list) so both always show the same icon/label per category — mirrors
 * `MapLibreProvider`'s `CATEGORY_ICON_INNER` (same lucide icon per
 * category, kept in sync manually since that file can't import React). */
export const CATEGORY_OPTIONS: {
  value: WaypointCategory
  label: string
  Icon: typeof MapPin
}[] = [
  { value: 'general', label: 'Général', Icon: MapPin },
  { value: 'stand_blind', label: 'Poste / cache', Icon: TreePine },
  { value: 'trail_camera', label: 'Caméra de sentier', Icon: Camera },
  { value: 'food_plot', label: 'Parcelle alimentaire', Icon: Wheat },
  { value: 'water', label: 'Eau', Icon: Droplet },
  { value: 'bedding_area', label: 'Aire de repos', Icon: Moon },
  { value: 'game_sign', label: 'Indice de gibier', Icon: Footprints },
  { value: 'kill_site', label: 'Site de récolte', Icon: Target },
  { value: 'trailhead', label: 'Départ de sentier', Icon: Signpost },
  { value: 'parking', label: 'Stationnement', Icon: Car },
  { value: 'campsite', label: 'Camp', Icon: Tent },
  { value: 'hazard', label: 'Danger', Icon: TriangleAlert },
  { value: 'gate', label: 'Barrière', Icon: DoorOpen },
  { value: 'custom', label: 'Personnalisé', Icon: Star },
]

export const CATEGORY_LABEL: Record<WaypointCategory, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map((option) => [option.value, option.label]),
) as Record<WaypointCategory, string>

export const CATEGORY_ICON: Record<WaypointCategory, typeof MapPin> = Object.fromEntries(
  CATEGORY_OPTIONS.map((option) => [option.value, option.Icon]),
) as Record<WaypointCategory, typeof MapPin>

export const COLOR_OPTIONS: { value: WaypointColor; label: string }[] = [
  { value: '#f59e0b', label: 'Ambre' },
  { value: '#ef4444', label: 'Rouge' },
  { value: '#3b82f6', label: 'Bleu' },
  { value: '#22c55e', label: 'Vert' },
  { value: '#a855f7', label: 'Violet' },
  { value: '#eab308', label: 'Jaune' },
  { value: '#ec4899', label: 'Rose' },
  { value: '#64748b', label: 'Ardoise' },
]

export const DEFAULT_WAYPOINT_COLOR: WaypointColor = '#f59e0b'
