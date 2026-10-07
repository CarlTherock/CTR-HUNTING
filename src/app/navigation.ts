import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Map,
  MapPin,
  CloudSun,
  Moon,
  BarChart3,
  NotebookPen,
  ListChecks,
  Settings,
} from 'lucide-react'

export interface NavItem {
  path: string
  label: string
  /** Short label for the cramped mobile bottom nav (defaults to `label`). */
  shortLabel?: string
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
  {
    path: '/',
    label: 'Tableau de bord',
    shortLabel: 'Accueil',
    icon: LayoutDashboard,
    phase: null,
    primary: true,
  },
  { path: '/map', label: 'Carte', icon: Map, phase: 1, primary: true },
  {
    path: '/waypoints',
    label: 'Points de repère et traces',
    shortLabel: 'Repères',
    icon: MapPin,
    phase: 2,
    primary: true,
  },
  {
    path: '/weather',
    label: 'Météo et vent',
    shortLabel: 'Météo',
    icon: CloudSun,
    phase: 5,
    primary: true,
  },
  { path: '/temporal', label: 'Soleil et lune', icon: Moon, phase: 7 },
  { path: '/analysis', label: 'Analyse du terrain', icon: BarChart3, phase: null },
  { path: '/journal', label: 'Journal', icon: NotebookPen, phase: null },
  // Entrée secondaire (hors barre du bas) : résumés et recherches calculés.
  { path: '/assistant', label: 'Assistant', icon: ListChecks, phase: 14 },
  { path: '/settings', label: 'Réglages', icon: Settings, phase: null, primary: true },
]
