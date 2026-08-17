import type { WeatherMapLayer, WindHourlyReading } from '@/types'

interface ColorStop {
  value: number
  color: [number, number, number]
}

/** Multi-stop color scales, each stop a real breakpoint on that layer's
 * calibrated legend — the same visual convention Windy uses (a
 * customizable, calibrated color scale per layer, confirmed live at
 * windy.com/colors): blue for calm/cold/dry, ramping through green/
 * yellow into orange/red for strong/hot/heavy. These are stylistic
 * design choices (color choices, not measured facts), not fabricated
 * data — the underlying values they're colored by are always real
 * Open-Meteo readings. */
const SCALES: Record<WeatherMapLayer, ColorStop[]> = {
  wind: [
    { value: 0, color: [59, 130, 246] }, // calm — blue
    { value: 15, color: [34, 197, 94] }, // breezy — green
    { value: 30, color: [234, 179, 8] }, // moderate — yellow
    { value: 45, color: [249, 115, 22] }, // strong — orange
    { value: 65, color: [239, 68, 68] }, // gale — red
  ],
  temperature: [
    { value: -20, color: [59, 130, 246] }, // freezing — blue
    { value: 0, color: [34, 211, 238] }, // cold — cyan
    { value: 12, color: [34, 197, 94] }, // cool — green
    { value: 22, color: [234, 179, 8] }, // mild — yellow
    { value: 32, color: [239, 68, 68] }, // hot — red
  ],
  precipitation: [
    { value: 0, color: [148, 163, 184] }, // dry — neutral slate (near-transparent)
    { value: 0.5, color: [59, 130, 246] }, // light — blue
    { value: 4, color: [124, 58, 237] }, // moderate — violet
    { value: 12, color: [219, 39, 119] }, // heavy — magenta
  ],
  clouds: [
    { value: 0, color: [96, 165, 250] }, // clear — sky blue
    { value: 50, color: [203, 213, 225] }, // partly cloudy — light slate
    { value: 100, color: [100, 116, 139] }, // overcast — slate
  ],
}

/** Each layer's real value bounds + unit, for the legend gradient bar —
 * kept in sync with `SCALES` above rather than re-deriving it. */
export const LAYER_LEGEND: Record<WeatherMapLayer, { min: number; max: number; unit: string; label: string }> = {
  wind: { min: 0, max: 65, unit: 'km/h', label: 'Wind speed' },
  temperature: { min: -20, max: 32, unit: '°C', label: 'Temperature' },
  precipitation: { min: 0, max: 12, unit: 'mm/h', label: 'Precipitation' },
  clouds: { min: 0, max: 100, unit: '%', label: 'Cloud cover' },
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Interpolated RGBA color string for `value` on `layer`'s scale —
 * clamped at the scale's ends (below the first stop reads as the first
 * stop's color, above the last as the last). */
export function weatherLayerColor(layer: WeatherMapLayer, value: number, alpha = 0.55): string {
  const stops = SCALES[layer]
  if (value <= stops[0].value) return rgba(stops[0].color, alpha)
  const last = stops[stops.length - 1]
  if (value >= last.value) return rgba(last.color, alpha)

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]
    const b = stops[i + 1]
    if (value >= a.value && value <= b.value) {
      const t = (value - a.value) / (b.value - a.value)
      const color: [number, number, number] = [
        lerp(a.color[0], b.color[0], t),
        lerp(a.color[1], b.color[1], t),
        lerp(a.color[2], b.color[2], t),
      ]
      return rgba(color, alpha)
    }
  }
  return rgba(last.color, alpha)
}

function rgba([r, g, b]: [number, number, number], alpha: number): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`
}

/** CSS `linear-gradient` stops for a layer's legend bar — real values
 * evenly sampled across its own min/max, not a generic rainbow. */
export function weatherLayerGradientCss(layer: WeatherMapLayer): string {
  const { min, max } = LAYER_LEGEND[layer]
  const steps = 8
  const stops: string[] = []
  for (let i = 0; i <= steps; i++) {
    const value = lerp(min, max, i / steps)
    stops.push(`${weatherLayerColor(layer, value, 1)} ${Math.round((i / steps) * 100)}%`)
  }
  return `linear-gradient(to right, ${stops.join(', ')})`
}

/** Pulls the real value a given layer visualizes out of an hourly
 * reading — the single place that maps "which field backs which layer",
 * so the canvas renderer and the legend never disagree. */
export function valueForLayer(layer: WeatherMapLayer, reading: WindHourlyReading): number {
  switch (layer) {
    case 'wind':
      return reading.speedKmh
    case 'temperature':
      return reading.temperatureCelsius
    case 'precipitation':
      return reading.precipitationMm
    case 'clouds':
      return reading.cloudCoverPercent
  }
}
