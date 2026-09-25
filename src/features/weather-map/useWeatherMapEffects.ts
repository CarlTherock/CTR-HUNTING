import { useEffect, useRef } from 'react'
import { useWindStore } from '@/features/wind/state/windStore'
import { hourIndexAt } from '@/utils/windField'
import type { Coordinate } from '@/types'
import type { LngLatBounds } from '@/utils/tiles'
import { useWeatherMapStore } from './state/weatherMapStore'

const PLAY_INTERVAL_MS = 650
/** Ticks playback waits for the next frame's tiles before advancing
 * anyway (a slow tile must never freeze the loop). */
const MAX_WAIT_TICKS = 4
const RADAR_REFRESH_MS = 5 * 60_000

export interface WeatherMapEffectsOptions {
  isFrameReady: (key: string) => boolean
  getBounds: () => LngLatBounds | null
  viewCenter: Coordinate
}

export function frameKey(layer: string, time: string): string {
  return `${layer}-${time}`
}

/** Playback, auto-refresh, center readout, wind-particle sync. Pure
 * timing/orchestration — the data rules live in the stores/providers. */
export function useWeatherMapEffects({ isFrameReady, getBounds, viewCenter }: WeatherMapEffectsOptions) {
  const enabled = useWeatherMapStore((s) => s.enabled)
  const playing = useWeatherMapStore((s) => s.playing)
  const activeLayer = useWeatherMapStore((s) => s.activeLayer)
  const frames = useWeatherMapStore((s) => s.frames)
  const frameIndex = useWeatherMapStore((s) => s.frameIndex)
  const windEnabled = useWindStore((s) => s.enabled)
  const windField = useWindStore((s) => s.field)
  const waitTicks = useRef(0)
  const isFrameReadyRef = useRef(isFrameReady)
  const getBoundsRef = useRef(getBounds)
  useEffect(() => {
    isFrameReadyRef.current = isFrameReady
    getBoundsRef.current = getBounds
  })

  // Playback loop — advances only once the next frame is loaded.
  useEffect(() => {
    if (!enabled || !playing) return
    const timer = setInterval(() => {
      const { frames: fs, frameIndex: i, activeLayer: layer } = useWeatherMapStore.getState()
      if (fs.length < 2) return
      const next = (i + 1) % fs.length
      const ready = isFrameReadyRef.current(frameKey(layer, fs[next].time))
      if (!ready && waitTicks.current < MAX_WAIT_TICKS) {
        waitTicks.current += 1
        return
      }
      waitTicks.current = 0
      useWeatherMapStore.getState().step(1)
    }, PLAY_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [enabled, playing])

  // Radar: pick up newly published images every 5 min.
  useEffect(() => {
    if (!enabled || activeLayer !== 'radar') return
    const timer = setInterval(() => void useWeatherMapStore.getState().loadFrames(true), RADAR_REFRESH_MS)
    return () => clearInterval(timer)
  }, [enabled, activeLayer])

  // Real value at the map center (debounced, paused during playback).
  useEffect(() => {
    if (!enabled || playing || frames.length === 0) return
    const timer = setTimeout(
      () => void useWeatherMapStore.getState().fetchCenterValue(viewCenter),
      400,
    )
    return () => clearTimeout(timer)
  }, [enabled, playing, frames, frameIndex, activeLayer, viewCenter])

  // Shared clock: the frame's instant drives the app-wide hour cursor
  // (wind particles, charts, Soleil & Lune) — matched to the real
  // Open-Meteo hourly sample for that instant, never an approximation.
  useEffect(() => {
    if (!enabled || !windField) return
    const frame = frames[frameIndex]
    if (!frame) return
    const index = hourIndexAt(windField, new Date(frame.time))
    if (index !== null) useWindStore.getState().setSelectedHourOffset(index)
  }, [enabled, windField, frames, frameIndex])

  // Wind particles follow the map: refetch (debounced) once the center
  // leaves the area the current field was sampled for.
  useEffect(() => {
    if (!windEnabled || !windField || windField.samples.length === 0) return
    const lats = windField.samples.map((s) => s.coordinate.lat)
    const lngs = windField.samples.map((s) => s.coordinate.lng)
    const inside =
      viewCenter.lat <= Math.max(...lats) &&
      viewCenter.lat >= Math.min(...lats) &&
      viewCenter.lng <= Math.max(...lngs) &&
      viewCenter.lng >= Math.min(...lngs)
    if (inside) return
    const timer = setTimeout(() => {
      const bounds = getBoundsRef.current()
      if (bounds && useWindStore.getState().status !== 'loading') void useWindStore.getState().fetch(bounds)
    }, 900)
    return () => clearTimeout(timer)
  }, [windEnabled, windField, viewCenter])
}
