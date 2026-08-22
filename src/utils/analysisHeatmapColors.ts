interface ColorStop {
  value: number
  color: [number, number, number]
}

/** Red (unfavorable) → yellow (neutral) → green (favorable), matching
 * the same 0/25/45/55/75/100 buckets `AnalysisControl.tsx`'s
 * `scoreLabel()` uses for its text labels — the heatmap and the text
 * summary always agree on what a given score means. */
const SCALE: ColorStop[] = [
  { value: 0, color: [239, 68, 68] }, // unfavorable — red
  { value: 25, color: [249, 115, 22] }, // somewhat unfavorable — orange
  { value: 45, color: [234, 179, 8] }, // neutral — yellow
  { value: 55, color: [163, 230, 53] }, // somewhat favorable — lime
  { value: 75, color: [34, 197, 94] }, // favorable — green
]

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function rgba([r, g, b]: [number, number, number], alpha: number): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`
}

/** Interpolated color for a combined analysis score (0-100), clamped at
 * the scale's ends. */
export function analysisHeatmapColor(score: number, alpha = 0.5): string {
  if (score <= SCALE[0].value) return rgba(SCALE[0].color, alpha)
  const last = SCALE[SCALE.length - 1]
  if (score >= last.value) return rgba(last.color, alpha)

  for (let i = 0; i < SCALE.length - 1; i++) {
    const a = SCALE[i]
    const b = SCALE[i + 1]
    if (score >= a.value && score <= b.value) {
      const t = (score - a.value) / (b.value - a.value)
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
