import { create } from 'zustand'

/**
 * Lets a tap (« Me localiser », « Suivre ma position ») start the phone
 * compass. iOS only grants the compass from inside a user gesture, so the
 * request must run synchronously in the click handler — not in a later effect.
 * The component that owns the compass registers its `requestPermission` here.
 */
interface HeadingConeState {
  requester: (() => Promise<void>) | null
  setRequester: (requester: (() => Promise<void>) | null) => void
  /** Call from a click handler. No-op when the compass needs no permission. */
  activate: () => void
}

export const useHeadingConeStore = create<HeadingConeState>((set, get) => ({
  requester: null,
  setRequester: (requester) => set({ requester }),
  activate: () => {
    const requester = get().requester
    if (requester) void requester()
  },
}))
