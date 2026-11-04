import { create } from 'zustand'

/** Whether the dedicated « Vent » panel is open. Separate from the wind
 * layer itself (`windStore.enabled`): the panel can be folded away while the
 * particles keep running. */
interface WindPanelState {
  open: boolean
  setOpen: (open: boolean) => void
  close: () => void
}

export const useWindPanelStore = create<WindPanelState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  close: () => set({ open: false }),
}))
