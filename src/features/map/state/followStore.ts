import { create } from 'zustand'

/**
 * "Follow my position" mode of the map.
 *
 *  - `off`       — the map never moves by itself;
 *  - `following` — each RECENT GPS fix recentres the map;
 *  - `paused`    — the user moved the map by hand: the app stops moving it
 *                  and shows "Reprendre le suivi". It never fights a gesture.
 *
 * Not persisted: following always starts `off`.
 */
export type FollowMode = 'off' | 'following' | 'paused'

interface FollowState {
  mode: FollowMode
  /** Rail button: off -> following, following -> off, paused -> following. */
  toggle: () => void
  /** The user dragged / zoomed / rotated the map. Only pauses a running follow. */
  pauseForUserGesture: () => void
  /** "Reprendre le suivi". */
  resume: () => void
  stop: () => void
}

export const useFollowStore = create<FollowState>((set, get) => ({
  mode: 'off',
  toggle: () => set({ mode: get().mode === 'following' ? 'off' : 'following' }),
  pauseForUserGesture: () => {
    if (get().mode === 'following') set({ mode: 'paused' })
  },
  resume: () => {
    if (get().mode === 'paused') set({ mode: 'following' })
  },
  stop: () => set({ mode: 'off' }),
}))
