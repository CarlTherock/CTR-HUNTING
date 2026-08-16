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
export const CATEGORY_OPTIONS: { value: WaypointCategory; label: string; Icon: typeof MapPin }[] =
  [
    { value: 'general', label: 'General', Icon: MapPin },
    { value: 'stand_blind', label: 'Stand / blind', Icon: TreePine },
    { value: 'trail_camera', label: 'Trail camera', Icon: Camera },
    { value: 'food_plot', label: 'Food plot', Icon: Wheat },
    { value: 'water', label: 'Water', Icon: Droplet },
    { value: 'bedding_area', label: 'Bedding area', Icon: Moon },
    { value: 'game_sign', label: 'Game sign', Icon: Footprints },
    { value: 'kill_site', label: 'Kill site', Icon: Target },
    { value: 'trailhead', label: 'Trailhead', Icon: Signpost },
    { value: 'parking', label: 'Parking', Icon: Car },
    { value: 'campsite', label: 'Campsite', Icon: Tent },
    { value: 'hazard', label: 'Hazard', Icon: TriangleAlert },
    { value: 'gate', label: 'Gate', Icon: DoorOpen },
    { value: 'custom', label: 'Custom', Icon: Star },
  ]

export const CATEGORY_LABEL: Record<WaypointCategory, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map((option) => [option.value, option.label]),
) as Record<WaypointCategory, string>

export const CATEGORY_ICON: Record<WaypointCategory, typeof MapPin> = Object.fromEntries(
  CATEGORY_OPTIONS.map((option) => [option.value, option.Icon]),
) as Record<WaypointCategory, typeof MapPin>

export const COLOR_OPTIONS: { value: WaypointColor; label: string }[] = [
  { value: '#f59e0b', label: 'Amber' },
  { value: '#ef4444', label: 'Red' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#22c55e', label: 'Green' },
  { value: '#a855f7', label: 'Purple' },
  { value: '#eab308', label: 'Yellow' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#64748b', label: 'Slate' },
]

export const DEFAULT_WAYPOINT_COLOR: WaypointColor = '#f59e0b'
