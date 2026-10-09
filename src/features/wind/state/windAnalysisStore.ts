import { create } from 'zustand'

/**
 * UI state of the « Analyse du vent » bottom panel. Kept in a store (not in
 * the component) so it survives a rotation or a re-mount of the map page.
 * The *time selection* is not here: it is `windStore.selectedHourOffset`,
 * shared with the charts, the Météo page and the particles.
 */
interface WindAnalysisState {
  /** Panel on screen (collapsed bar or expanded sheet). */
  open: boolean
  /** Expanded sheet (days, time bar, details) vs. one-line summary. */
  expanded: boolean
  openPanel: () => void
  closePanel: () => void
  setExpanded: (expanded: boolean) => void
}

export const useWindAnalysisStore = create<WindAnalysisState>((set) => ({
  open: false,
  expanded: true,
  openPanel: () => set({ open: true, expanded: true }),
  closePanel: () => set({ open: false }),
  setExpanded: (expanded) => set({ expanded }),
}))
