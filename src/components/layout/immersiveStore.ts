import { create } from 'zustand'

/**
 * Immersive map mode: the app chrome (top bar, bottom nav, sidebar) is
 * hidden so the map uses the whole screen. This is a layout state shared
 * between `AppShell` (which hides the chrome) and the map feature (which
 * toggles it), so it lives with the layout, not inside a feature.
 *
 * It is deliberately NOT persisted: an app that reopens with no visible
 * navigation would look broken.
 */
interface ImmersiveState {
  immersive: boolean
  setImmersive: (value: boolean) => void
}

export const useImmersiveStore = create<ImmersiveState>((set) => ({
  immersive: false,
  setImmersive: (immersive) => set({ immersive }),
}))
