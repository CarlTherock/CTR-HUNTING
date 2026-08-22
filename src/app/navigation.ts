import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Map,
  MapPin,
  CloudSun,
  Moon,
  BarChart3,
  NotebookPen,
  Settings,
} from 'lucide-react'

export interface NavItem {
  path: string
  label: string
  icon: LucideIcon
  /** Roadmap phase that implements this section. `null` means already
   * functional (not a placeholder). */
  phase: number | null
  /** Shown in the mobile bottom nav (kept short for one-handed use). */
  primary?: boolean
}

/**
 * Single source of truth for the app's information architecture. The
 * desktop sidebar renders every item; the mobile bottom nav renders only
 * the `primary` ones, per the project's mobile-first / usable-outdoors UX
 * rule (a handful of large touch targets beats a crowded bottom bar).
 */
export const navItems: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, phase: null, primary: true },
  { path: '/map', label: 'Map', icon: Map, phase: 1, primary: true },
  {
    path: '/waypoints',
    label: 'Waypoints & Tracks',
    icon: MapPin,
    phase: 2,
    primary: true,
  },
  { path: '/weather', label: 'Weather & Wind', icon: CloudSun, phase: 5, primary: true },
  { path: '/temporal', label: 'Sun & Moon', icon: Moon, phase: 7 },
  { path: '/analysis', label: 'Terrain Analysis', icon: BarChart3, phase: 9 },
  { path: '/journal', label: 'Journal', icon: NotebookPen, phase: 13 },
  { path: '/settings', label: 'Settings', icon: Settings, phase: null, primary: true },
]
