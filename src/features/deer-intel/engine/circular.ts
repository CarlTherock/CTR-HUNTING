/** Direction en degrés [0, 360). */
export function normalizeDegrees(deg: number): number {
  return ((deg % 360) + 360) % 360
}

/** Écart angulaire minimal entre deux directions (0–180) : 359° → 1° vaut 2°, pas 358°. */
export function angularDifference(a: number, b: number): number {
  const d = Math.abs(normalizeDegrees(a) - normalizeDegrees(b))
  return d > 180 ? 360 - d : d
}

/** Cap de l'écoulement (vers où souffle le vent) à partir de la direction d'origine météo. */
export function flowDegrees(fromDegrees: number): number {
  return normalizeDegrees(fromDegrees + 180)
}
