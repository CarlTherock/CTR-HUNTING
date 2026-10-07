import { create } from 'zustand'
import { layerDef, weatherMapProvider } from '@/services/weather-map'
import type { Coordinate, WeatherMapFrame, WeatherMapLayerId } from '@/types'

export type WeatherMapStatus = 'idle' | 'loading' | 'available' | 'error'

/** Radar refreshes every 5 min (GeoMet publishes every 6 min); model
 * frames are good for 30 min (HRDPS runs every 6 h). */
const FRAME_TTL_MS: Record<'observed' | 'forecast', number> = {
  observed: 5 * 60_000,
  forecast: 30 * 60_000,
}

interface CachedFrames {
  frames: WeatherMapFrame[]
  fetchedAt: number
}

interface WeatherMapState {
  enabled: boolean
  activeLayer: WeatherMapLayerId
  status: WeatherMapStatus
  errorReason: string | null
  frames: WeatherMapFrame[]
  frameIndex: number
  playing: boolean
  opacity: number
  /** Real point value at the map center for the current frame — `null`
   * when GeoMet reports nothing there (never shown as a made-up 0). */
  centerValue: string | null
  centerValueStatus: WeatherMapStatus
  cache: Partial<Record<WeatherMapLayerId, CachedFrames>>

  toggle: () => void
  setEnabled: (enabled: boolean) => void
  setLayer: (layer: WeatherMapLayerId) => Promise<void>
  loadFrames: (force?: boolean) => Promise<void>
  setFrameIndex: (index: number) => void
  step: (delta: number) => void
  setPlaying: (playing: boolean) => void
  setOpacity: (opacity: number) => void
  fetchCenterValue: (coordinate: Coordinate) => Promise<void>
}

/** The frame closest to "now": latest radar image, or the current hour. */
function defaultIndex(frames: WeatherMapFrame[]): number {
  if (frames.length === 0) return 0
  return frames[0].kind === 'observed' ? frames.length - 1 : 0
}

let valueRequestId = 0

export const useWeatherMapStore = create<WeatherMapState>((set, get) => ({
  enabled: false,
  activeLayer: 'radar',
  status: 'idle',
  errorReason: null,
  frames: [],
  frameIndex: 0,
  playing: false,
  opacity: 0.75,
  centerValue: null,
  centerValueStatus: 'idle',
  cache: {},

  toggle: () => get().setEnabled(!get().enabled),

  setEnabled: (enabled) => {
    set({ enabled, playing: false })
    if (enabled) void get().loadFrames()
  },

  setLayer: async (layer) => {
    if (layer === get().activeLayer && get().frames.length > 0) return
    set({
      activeLayer: layer,
      playing: false,
      centerValue: null,
      centerValueStatus: 'idle',
    })
    await get().loadFrames()
  },

  loadFrames: async (force = false) => {
    const layer = get().activeLayer
    const def = layerDef(layer)
    const cached = get().cache[layer]
    if (!force && cached && Date.now() - cached.fetchedAt < FRAME_TTL_MS[def.kind]) {
      set({
        frames: cached.frames,
        frameIndex: defaultIndex(cached.frames),
        status: 'available',
        errorReason: null,
      })
      return
    }
    set({ status: 'loading', errorReason: null })
    try {
      const frames = await weatherMapProvider.fetchFrames(def)
      // A slow response for a layer the user already switched away from
      // must never overwrite the current one.
      if (get().activeLayer !== layer) return
      const previousTime = get().frames[get().frameIndex]?.time
      const keptIndex =
        force && previousTime ? frames.findIndex((f) => f.time === previousTime) : -1
      set({
        frames,
        frameIndex: keptIndex >= 0 ? keptIndex : defaultIndex(frames),
        status: 'available',
        cache: { ...get().cache, [layer]: { frames, fetchedAt: Date.now() } },
      })
    } catch (err) {
      if (get().activeLayer !== layer) return
      set({
        status: 'error',
        errorReason: err instanceof Error ? err.message : 'Erreur inconnue',
        frames: [],
      })
    }
  },

  setFrameIndex: (index) => {
    const { frames } = get()
    if (frames.length === 0) return
    set({ frameIndex: Math.max(0, Math.min(frames.length - 1, index)) })
  },

  step: (delta) => {
    const { frames, frameIndex } = get()
    if (frames.length === 0) return
    set({ frameIndex: (frameIndex + delta + frames.length) % frames.length })
  },

  setPlaying: (playing) => set({ playing }),

  setOpacity: (opacity) => set({ opacity: Math.max(0.1, Math.min(1, opacity)) }),

  fetchCenterValue: async (coordinate) => {
    const { activeLayer, frames, frameIndex } = get()
    const frame = frames[frameIndex]
    const def = layerDef(activeLayer)
    if (!frame || !def.formatValue) {
      set({ centerValue: null, centerValueStatus: 'idle' })
      return
    }
    const requestId = ++valueRequestId
    set({ centerValueStatus: 'loading' })
    try {
      const value = await weatherMapProvider.fetchValueAt(def, frame.time, coordinate)
      if (requestId !== valueRequestId) return
      set({ centerValue: value, centerValueStatus: 'available' })
    } catch {
      if (requestId !== valueRequestId) return
      set({ centerValue: null, centerValueStatus: 'error' })
    }
  },
}))
