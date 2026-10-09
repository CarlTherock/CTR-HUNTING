import { create } from 'zustand'

/**
 * UI state of the « Analyse du vent » bottom panel. Kept in a store (not in
 * the component) so it survives a rotation or a re-mount of the map page.
 * The *time selection* is not here: it is `windStore.selectedHourOffset`,
 * shared with the charts, the Météo page and the particles.
 */
interface WindAnalysisState {
  /** Panel on screen (collapsed bar or expanded sheet). While it is, the
   * bottom navigation is hidden (the panel takes its place). */
  open: boolean
  /** Expanded sheet (days, time bar) vs. one-line summary. */
  expanded: boolean
  /** Height in px the panel takes from the bottom of the map area (safe area
   * included), measured by the panel itself; 0 when closed. The map page uses
   * it to keep the tool rail, the attributions and the other bottom panels
   * clear of the sheet. */
  sheetHeight: number
  openPanel: () => void
  closePanel: () => void
  setExpanded: (expanded: boolean) => void
  setSheetHeight: (height: number) => void
}

export const useWindAnalysisStore = create<WindAnalysisState>((set) => ({
  open: false,
  expanded: true,
  sheetHeight: 0,
  openPanel: () => set({ open: true, expanded: true }),
  closePanel: () => set({ open: false, sheetHeight: 0 }),
  setExpanded: (expanded) => set({ expanded }),
  setSheetHeight: (sheetHeight) => set({ sheetHeight }),
}))
