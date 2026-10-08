import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  Bot,
  Database,
  DatabaseBackup,
  Droplets,
  FolderTree,
  Info,
  LayoutDashboard,
  LifeBuoy,
  Map,
  MapPin,
  CloudSun,
  Moon,
  MoreHorizontal,
  NotebookPen,
  PawPrint,
  Route,
  ListChecks,
  Settings,
  ShieldCheck,
} from 'lucide-react'

/** Where an entry is listed besides the sidebar: the « Mes données » hub, the
 * « Plus » hub, or nowhere (a main destination of the bottom bar). */
export type NavHub = 'data' | 'more'

/** Sidebar sections (desktop / tablet). */
export type NavGroup = 'main' | 'data' | 'analysis' | 'more'

export const NAV_GROUP_LABEL: Record<NavGroup, string> = {
  main: 'Terrain',
  data: 'Mes données',
  analysis: 'Analyse',
  more: 'Plus',
}

export interface NavItem {
  /** Route. */
  path: string
  /** Optional `#section` of the route (an entry that points inside a page). */
  hash?: string
  label: string
  /** Short label for the cramped mobile bottom nav (defaults to `label`). */
  shortLabel?: string
  /** One line shown in the hubs. */
  description?: string
  icon: LucideIcon
  /** Roadmap phase that implements this section. `null` means already
   * functional (not a placeholder). */
  phase: number | null
  /** Shown in the mobile bottom nav (kept short for one-handed use). */
  primary?: boolean
  group: NavGroup
  /** Listed in a hub page. */
  hub?: NavHub
  /** Not listed in the sidebar (hub pages and pages reached from a hub). */
  hideInSidebar?: boolean
  /** Reached from a hub/link only: not a route of its own in the nav bars. */
  secondary?: boolean
}

/** Link target of an entry, hash included. */
export function navTarget(item: Pick<NavItem, 'path' | 'hash'>): string {
  return item.hash ? `${item.path}#${item.hash}` : item.path
}

/**
 * Single source of truth for the app's information architecture.
 *
 * - Mobile bottom bar: the five `primary` entries (Accueil, Carte, Mes
 *   données, Météo, Plus).
 * - « Mes données » and « Plus » are hub pages built from the `hub` field.
 * - Desktop / tablet sidebar: every entry not `hideInSidebar`, by `group`.
 *
 * Adding a page = adding one entry here (and its route in `routes.tsx`).
 */
export const navItems: NavItem[] = [
  // — Barre principale —
  {
    path: '/',
    label: 'Tableau de bord',
    shortLabel: 'Accueil',
    icon: LayoutDashboard,
    phase: null,
    primary: true,
    group: 'main',
  },
  { path: '/map', label: 'Carte', icon: Map, phase: 1, primary: true, group: 'main' },
  {
    path: '/data',
    label: 'Mes données',
    icon: Database,
    phase: null,
    primary: true,
    group: 'data',
    hideInSidebar: true,
  },
  {
    path: '/weather',
    label: 'Météo et vent',
    shortLabel: 'Météo',
    icon: CloudSun,
    phase: 5,
    primary: true,
    group: 'main',
  },
  {
    path: '/more',
    label: 'Plus',
    icon: MoreHorizontal,
    phase: null,
    primary: true,
    group: 'more',
    hideInSidebar: true,
  },

  // — Mes données —
  {
    path: '/waypoints',
    hash: 'territoires',
    label: 'Territoires',
    description: 'Dossiers logiques : filtrer, créer, renommer.',
    icon: FolderTree,
    phase: 2,
    group: 'data',
    hub: 'data',
  },
  {
    path: '/waypoints',
    label: 'Points de repère',
    description: 'Waypoints, coordonnées, photos, partage.',
    icon: MapPin,
    phase: 2,
    group: 'data',
    hub: 'data',
  },
  {
    path: '/waypoints',
    hash: 'traces',
    label: 'Traces',
    description: 'Trajets enregistrés, couleurs, reprise.',
    icon: Route,
    phase: 2,
    group: 'data',
    hub: 'data',
  },
  {
    path: '/waypoints',
    hash: 'recherches-de-sang',
    label: 'Recherches de sang',
    description: 'Démarrer, reprendre, sessions enregistrées, caméra.',
    icon: Droplets,
    phase: null,
    group: 'data',
    hub: 'data',
  },
  {
    path: '/journal',
    label: 'Journal et observations',
    description: 'Notes, photos, position et conditions réelles.',
    icon: NotebookPen,
    phase: null,
    group: 'data',
    hub: 'data',
  },
  {
    path: '/deertracker',
    label: 'DeerTracker',
    description: 'Suivi de mes observations et indices de cerfs.',
    icon: PawPrint,
    phase: null,
    group: 'data',
    hub: 'data',
  },

  // — Analyse —
  { path: '/temporal', label: 'Soleil et lune', icon: Moon, phase: 7, group: 'analysis' },
  {
    path: '/analysis',
    label: 'Analyse du terrain',
    icon: BarChart3,
    phase: null,
    group: 'analysis',
  },
  {
    path: '/assistant',
    label: 'Assistant',
    description: 'Résumés et recherches calculés ; IA générative non activée.',
    icon: ListChecks,
    phase: 14,
    group: 'analysis',
    hub: 'more',
  },

  // — Plus —
  {
    path: '/project',
    label: 'Projet et progression',
    description: 'Toutes les phases, priorités, validations et version.',
    icon: Bot,
    phase: null,
    group: 'more',
    hub: 'more',
  },
  {
    path: '/settings',
    hash: 'donnees-et-sauvegarde',
    label: 'Sauvegarde, import et export',
    description: 'Sauvegarde ZIP, restauration, GPX.',
    icon: DatabaseBackup,
    phase: 15,
    group: 'more',
    hub: 'more',
  },
  {
    path: '/settings',
    label: 'Réglages',
    description: 'Préférences, hors ligne, suppression des données.',
    icon: Settings,
    phase: null,
    group: 'more',
    hub: 'more',
  },
  {
    path: '/help',
    label: 'Aide',
    description: 'Guide d’utilisation et limites.',
    icon: LifeBuoy,
    phase: null,
    group: 'more',
    hub: 'more',
    secondary: true,
  },
  {
    path: '/privacy',
    label: 'Confidentialité',
    description: 'Ce qui reste sur l’appareil, ce qui est envoyé.',
    icon: ShieldCheck,
    phase: null,
    group: 'more',
    hub: 'more',
    secondary: true,
  },
  {
    path: '/about',
    label: 'À propos',
    description: 'Version, sources, mises à jour.',
    icon: Info,
    phase: null,
    group: 'more',
    hub: 'more',
    secondary: true,
  },
]

export const primaryNavItems = navItems.filter((item) => item.primary)

export function hubItems(hub: NavHub): NavItem[] {
  return navItems.filter((item) => item.hub === hub)
}

/** Title of the page shown in the mobile top bar for a pathname. */
export function titleForPath(pathname: string): string | undefined {
  const exact = navItems.find((item) => item.path === pathname && !item.hash)
  if (exact) return exact.label
  const prefix = navItems.find(
    (item) => item.path !== '/' && pathname.startsWith(item.path),
  )
  return prefix?.label
}
