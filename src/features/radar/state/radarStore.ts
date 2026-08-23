import { create } from 'zustand'
import { radarProvider, radarTileUrlTemplate } from '@/services/radar'
import type { RadarFrame, RadarFrameSet } from '@/types'

export type RadarStatus = 'idle' | 'loading' | 'available' | 'error'

interface RadarState {
  status: RadarStatus
  frames: RadarFrameSet | null
  errorReason: string | null
  enabled: boolean
  /** Index into the combined `past` + `nowcast` frame list — defaults to
   * the last *past* (real, observed) frame once frames load, i.e. "now,"
   * never a nowcast frame by default. */
  selectedFrameIndex: number
  opacity: number

  toggle: () => void
  fetch: () => Promise<void>
  setSelectedFrameIndex: (index: number) => void
  setOpacity: (opacity: number) => void
  /** All frames in chronological order (real observed `past`, then
   * RainViewer's own `nowcast` extrapolation) — the flat list the frame
   * scrubber indexes into. */
  allFrames: () => RadarFrame[]
  /** The tile URL template for the currently selected frame, or `null` if
   * no frames are loaded yet — what `MapInstance.setRadarLayer` receives. */
  selectedTileUrlTemplate: () => string | null
}

export const useRadarStore = create<RadarState>((set, get) => ({
  status: 'idle',
  frames: null,
  errorReason: null,
  enabled: false,
  selectedFrameIndex: 0,
  opacity: 0.75,

  toggle: () => {
    const { enabled, frames } = get()
    if (enabled) {
      set({ enabled: false })
      return
    }
    set({ enabled: true })
    if (!frames) void get().fetch()
  },

  fetch: async () => {
    set({ status: 'loading' })
    try {
      const frames = await radarProvider.fetchFrames()
      set({
        status: 'available',
        frames,
        errorReason: null,
        // "Now" — the most recent real observed frame, not a nowcast one.
        selectedFrameIndex: Math.max(0, frames.past.length - 1),
      })
    } catch (err) {
      set({ status: 'error', errorReason: err instanceof Error ? err.message : 'Unknown error' })
    }
  },

  setSelectedFrameIndex: (index) => {
    const total = get().allFrames().length
    set({ selectedFrameIndex: Math.max(0, Math.min(total - 1, index)) })
  },

  setOpacity: (opacity) => set({ opacity: Math.max(0, Math.min(1, opacity)) }),

  allFrames: () => {
    const { frames } = get()
    if (!frames) return []
    return [...frames.past, ...frames.nowcast]
  },

  selectedTileUrlTemplate: () => {
    const { frames, selectedFrameIndex } = get()
    if (!frames) return null
    const frame = get().allFrames()[selectedFrameIndex]
    if (!frame) return null
    return radarTileUrlTemplate(frames.host, frame.path)
  },
}))
