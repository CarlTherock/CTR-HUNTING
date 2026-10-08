import {
  openJournalEntry,
  openWaypointSheet,
  viewWaypointOnMap,
} from '@/features/compare/compareActions'
import type { Navigate } from '@/features/compare/compareActions'
import { useHeatmapStore } from '@/features/analytics/state/heatmapStore'
import { useMapStore } from '@/features/map/state/mapStore'
import type { EntityRef } from './types'

/** Zoom minimal quand on centre la carte sur un élément. */
const VIEW_MIN_ZOOM = 15

/** `cell-12` -> 12 ; sinon `null` (point analysé librement). */
export function cellIndexOf(ref: EntityRef): number | null {
  const match = /^cell-(\d+)$/.exec(ref.id)
  return match ? Number(match[1]) : null
}

export interface RefAction {
  /** Texte du bouton principal. */
  label: string
  /** Description pour les lecteurs d'écran. */
  hint: string
}

/** Ce que fait le lien principal d'une référence. */
export function primaryActionOf(ref: EntityRef): RefAction {
  switch (ref.kind) {
    case 'waypoint':
      return { label: 'Fiche', hint: 'Ouvrir la fiche du point de repère' }
    case 'journal':
      return { label: 'Entrée', hint: 'Ouvrir l’entrée dans le journal' }
    case 'track':
      return { label: 'Traces', hint: 'Voir la liste des traces' }
    case 'cell':
      return { label: 'Carte', hint: 'Voir la cellule sur la carte' }
  }
}

/** Un bouton « Carte » secondaire n'existe que si l'élément a une position. */
export function canViewOnMap(ref: EntityRef): boolean {
  return ref.kind !== 'track' && ref.coordinate !== undefined
}

/** Centre la carte sur l'élément (lecture seule : rien n'est modifié). */
export function viewRefOnMap(ref: EntityRef, navigate: Navigate): boolean {
  if (ref.kind === 'waypoint') {
    // Réutilise l'action du comparateur (point relu dans le magasin).
    if (viewWaypointOnMap(ref.id, navigate)) return true
  }
  if (!ref.coordinate) return false
  const zoom = Math.max(useMapStore.getState().view.zoom, VIEW_MIN_ZOOM)
  useMapStore.getState().setView({
    center: { lat: ref.coordinate.lat, lng: ref.coordinate.lng },
    zoom,
  })
  const index = cellIndexOf(ref)
  if (ref.kind === 'cell' && index !== null) {
    const heatmap = useHeatmapStore.getState()
    if (heatmap.cells[index]) heatmap.selectCell(index)
  }
  navigate('/map')
  return true
}

/**
 * Ouvre l'élément cité : fiche du point, entrée de journal, liste des
 * traces, ou cellule sur la carte. Aucune de ces actions ne modifie une
 * donnée.
 */
export function openRef(ref: EntityRef, navigate: Navigate): boolean {
  switch (ref.kind) {
    case 'waypoint':
      openWaypointSheet(ref.id)
      navigate('/waypoints')
      return true
    case 'journal':
      openJournalEntry(ref.id, navigate)
      return true
    case 'track':
      navigate('/waypoints')
      return true
    case 'cell':
      return viewRefOnMap(ref, navigate)
  }
}
