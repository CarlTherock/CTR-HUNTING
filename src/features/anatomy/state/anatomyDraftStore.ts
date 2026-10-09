import { create } from 'zustand'
import type { ShotSpecies } from '@/types'
import { ILLUSTRATIONS } from '../illustrations'
import { initialZoom, type ZoomState } from '../anatomyLogic'
import type { Point } from '../types'

/** What the user is doing on the anatomy screen. Kept in memory only, so it
 * survives rotation and a trip to another screen; nothing is saved to the
 * shot until « Enregistrer ». */
interface AnatomyDraft {
  species: ShotSpecies
  point: Point | null
  note: string
  annotations: boolean
  panelOpen: boolean
  zoom: ZoomState
  /** Shot whose saved estimate was loaded into this draft. */
  loadedShotId: string | null
  setSpecies: (species: ShotSpecies) => void
  setPoint: (point: Point | null) => void
  setNote: (note: string) => void
  setAnnotations: (shown: boolean) => void
  setPanelOpen: (open: boolean) => void
  setZoom: (zoom: ZoomState) => void
  load: (input: {
    shotId: string
    species: ShotSpecies
    point: Point | null
    note: string
  }) => void
  clear: () => void
}

export const useAnatomyDraft = create<AnatomyDraft>((set) => ({
  species: 'deer',
  point: null,
  note: '',
  annotations: true,
  panelOpen: false,
  zoom: initialZoom(ILLUSTRATIONS.deer),
  loadedShotId: null,
  // The drawings differ: a point never carries over from one species to the
  // other.
  setSpecies: (species) =>
    set((state) =>
      state.species === species
        ? state
        : { species, point: null, zoom: initialZoom(ILLUSTRATIONS[species]) },
    ),
  // The panel opens when the first point is placed; moving the point later
  // never reopens a panel the user folded.
  setPoint: (point) =>
    set((state) =>
      point === null
        ? { point: null, panelOpen: false }
        : { point, panelOpen: state.point === null ? true : state.panelOpen },
    ),
  setNote: (note) => set({ note }),
  setAnnotations: (annotations) => set({ annotations }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  setZoom: (zoom) => set({ zoom }),
  load: ({ shotId, species, point, note }) =>
    set({
      loadedShotId: shotId,
      species,
      point,
      note,
      zoom: initialZoom(ILLUSTRATIONS[species]),
      panelOpen: point !== null,
    }),
  clear: () =>
    set({
      point: null,
      note: '',
      loadedShotId: null,
      panelOpen: false,
      zoom: initialZoom(ILLUSTRATIONS.deer),
      species: 'deer',
    }),
}))
