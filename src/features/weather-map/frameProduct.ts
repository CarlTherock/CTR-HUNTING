import type { WeatherMapFrame } from '@/types'
import { formatFrameClock } from './formatFrameTime'

/** The three products a radar timeline mixes — never blended into one. */
export type FrameProduct = 'observed' | 'extrapolated' | 'model' | 'forecast'

export function frameProduct(frame: WeatherMapFrame): FrameProduct {
  if (frame.kind === 'observed') return 'observed'
  if (frame.extrapolated) return 'extrapolated'
  if (frame.modelForecast) return 'model'
  return 'forecast'
}

export const PRODUCT_LABEL: Record<FrameProduct, string> = {
  observed: 'Observé',
  extrapolated: 'Extrapolation ECCC',
  model: 'Modèle HRDPS',
  forecast: 'Prévu',
}

/** What the data is, in words — the model part is explicitly not the radar. */
export const PRODUCT_SHORT: Record<FrameProduct, string> = {
  observed: 'observé',
  extrapolated: 'extrapolé',
  model: 'modèle HRDPS',
  forecast: 'prévu',
}

/** Short form for the panel header. */
export const PRODUCT_HEADER: Record<FrameProduct, string> = {
  observed: 'Radar ECCC 1 km',
  extrapolated: 'Extrapolation ECCC 1 km',
  model: 'Modèle HRDPS 2,5 km',
  forecast: 'Prévision HRDPS 2,5 km · ECCC',
}

export const PRODUCT_SOURCE: Record<FrameProduct, string> = {
  observed: 'Radar observé · ECCC 1 km',
  extrapolated: 'Extrapolation du radar · ECCC 1 km (calcul, pas une observation)',
  model: 'Prévision du modèle HRDPS · ECCC 2,5 km, cumul sur 1 h (pas le radar)',
  forecast: 'Prévision HRDPS 2,5 km · ECCC',
}

export const PRODUCT_STYLE: Record<FrameProduct, { badge: string; bar: string }> = {
  observed: {
    badge: 'border-sky-400/60 bg-sky-400/15 text-sky-300',
    bar: 'bg-sky-400',
  },
  extrapolated: {
    badge: 'border-amber-400/60 bg-amber-400/15 text-amber-300',
    bar: 'bg-amber-400',
  },
  model: {
    badge: 'border-violet-400/60 bg-violet-400/15 text-violet-300',
    bar: 'bg-violet-400',
  },
  forecast: {
    badge: 'border-amber-400/60 bg-amber-400/15 text-amber-300',
    bar: 'bg-amber-400',
  },
}

export interface ProductSegment {
  product: FrameProduct
  /** Inclusive frame indexes. */
  from: number
  to: number
}

/** Consecutive runs of the same product, deduced from the frames actually
 * available (no fixed duration anywhere). */
export function productSegments(frames: WeatherMapFrame[]): ProductSegment[] {
  const segments: ProductSegment[] = []
  frames.forEach((frame, index) => {
    const product = frameProduct(frame)
    const last = segments[segments.length - 1]
    if (last && last.product === product) last.to = index
    else segments.push({ product, from: index, to: index })
  })
  return segments
}

/** "Observé : 5 h 24 · Extrapolation ECCC : jusqu'à 6 h 12 · Modèle HRDPS :
 * 7 h → 9 h" — only the parts that exist. */
export function describeSegments(frames: WeatherMapFrame[], now: Date): string {
  return productSegments(frames)
    .map((s) => {
      const start = formatFrameClock(frames[s.from], now)
      const end = formatFrameClock(frames[s.to], now)
      if (s.product === 'observed') return `${PRODUCT_LABEL.observed} : ${end}`
      return s.from === s.to
        ? `${PRODUCT_LABEL[s.product]} : ${start}`
        : `${PRODUCT_LABEL[s.product]} : ${start} → ${end}`
    })
    .join(' · ')
}
