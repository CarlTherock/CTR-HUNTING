import { create } from 'zustand'
import type { SharedPoint } from './sharedPoint'

export const INVALID_SHARED_LINK_NOTICE = 'Lien de point partagé invalide'

interface SharedPointState {
  /** The point from an opened link, shown as a preview until the user
   * dismisses it or saves it. Never persisted by this store. */
  point: SharedPoint | null
  /** Short notice when an opened link could not be used. */
  notice: string | null
  show: (point: SharedPoint) => void
  dismiss: () => void
  reportInvalid: () => void
  dismissNotice: () => void
}

/** In-memory only: receiving a link writes nothing to the database. */
export const useSharedPointStore = create<SharedPointState>((set) => ({
  point: null,
  notice: null,
  show: (point) => set({ point, notice: null }),
  dismiss: () => set({ point: null }),
  reportInvalid: () => set({ notice: INVALID_SHARED_LINK_NOTICE }),
  dismissNotice: () => set({ notice: null }),
}))
