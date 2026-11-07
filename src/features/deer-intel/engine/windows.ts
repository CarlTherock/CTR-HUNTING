import type { HourSlot, HuntWindow, Robustness } from './types'

export const COMBINE_RULE_IDS = ['IDX-COMBINE-01'] as const

export const REFERENCE_ACTIVITY_WEIGHT = 0.65
export const WINDOW_THRESHOLD = 55
/** Écart (points) sous lequel deux créneaux ne sont pas départagés. */
export const EQUIVALENCE_MARGIN = 3

/** Indice d'une heure : 65 % activité + 35 % conditions ; les conditions absentes ne sont pas remplacées. */
export function slotIndex(
  slot: Pick<HourSlot, 'activity' | 'activityWithHypothesis' | 'conditions'>,
  activityWeight: number,
  withHypothesis: boolean,
): number | null {
  const act = withHypothesis ? slot.activityWithHypothesis : slot.activity
  if (act === null) return null
  if (slot.conditions === null) return act
  return activityWeight * act + (1 - activityWeight) * slot.conditions
}

/** Heure de fin affichée (fin de la dernière heure du créneau, `HH:mm` local). */
function endClockOf(slot: HourSlot): string {
  const [h, m] = slot.clock.split(':').map(Number)
  const total = (h * 60 + m + 60) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function sameFactors(slots: HourSlot[]): boolean {
  return new Set(slots.map((s) => s.signature)).size <= 1
}

/** Fenêtres de chasse : heures contiguës admissibles dont l'indice atteint un seuil ABSOLU. */
export function buildWindows(
  slots: HourSlot[],
  index: (slot: HourSlot) => number | null,
  threshold: number,
): HuntWindow[] {
  const windows: HuntWindow[] = []
  let run: { slot: HourSlot; value: number }[] = []
  const flush = () => {
    if (run.length === 0) return
    const values = run.map((r) => r.value)
    const first = run[0].slot
    const last = run[run.length - 1].slot
    windows.push({
      startIso: first.startIso,
      endIso: last.endIso,
      startClock: first.clock,
      endClock: endClockOf(last),
      meanIndex: values.reduce((a, b) => a + b, 0) / values.length,
      maxIndex: Math.max(...values),
      hours: run.length,
      comparable: sameFactors(run.map((r) => r.slot)),
    })
    run = []
  }
  for (const slot of slots) {
    const v = slot.candidate ? index(slot) : null
    if (v !== null && v >= threshold) run.push({ slot, value: v })
    else flush()
  }
  flush()
  return windows.sort(
    (a, b) => b.meanIndex - a.meanIndex || a.startIso.localeCompare(b.startIso),
  )
}

function overlaps(a: HuntWindow, b: HuntWindow): boolean {
  return a.startIso < b.endIso && b.startIso < a.endIso
}

/**
 * Robustesse du classement : on fait varier le poids de l'activité (0,5–0,8) et le seuil
 * (50–60). Si un faible changement inverse le meilleur créneau, on affiche « fragile » ; si les
 * deux meilleurs sont à moins de EQUIVALENCE_MARGIN points, « équivalents » — jamais un faux
 * vainqueur.
 */
export function assessRobustness(slots: HourSlot[]): {
  robustness: Robustness
  note: string
} {
  const candidates = slots.filter((s) => s.candidate && s.activity !== null)
  if (candidates.length === 0) {
    return {
      robustness: 'insufficient',
      note: 'Aucune heure admissible avec des données suffisantes : rien à classer.',
    }
  }
  const ref = buildWindows(
    slots,
    (s) => slotIndex(s, REFERENCE_ACTIVITY_WEIGHT, false),
    WINDOW_THRESHOLD,
  )
  const withHyp = false
  const tops: (HuntWindow | null)[] = []
  for (const w of [0.5, REFERENCE_ACTIVITY_WEIGHT, 0.8]) {
    for (const thr of [50, WINDOW_THRESHOLD, 60]) {
      tops.push(buildWindows(slots, (s) => slotIndex(s, w, withHyp), thr)[0] ?? null)
    }
  }
  if (ref.length === 0) {
    return {
      robustness: 'none',
      note: 'Aucune heure n’atteint le seuil de l’indice ce jour-là : pas de créneau marqué.',
    }
  }
  const values = candidates
    .map((s) => slotIndex(s, REFERENCE_ACTIVITY_WEIGHT, false))
    .filter((v): v is number => v !== null)
  if (Math.max(...values) - Math.min(...values) < 5) {
    return {
      robustness: 'equivalent',
      note: 'Les heures admissibles ont des indices presque identiques : données insuffisantes pour départager.',
    }
  }
  const first = tops[0]
  const unstable = tops.some((t) => t === null || first === null || !overlaps(t, first))
  if (unstable) {
    return {
      robustness: 'fragile',
      note: 'Un faible changement des poids ou du seuil change le meilleur créneau : le classement est fragile.',
    }
  }
  if (ref.length >= 2 && ref[0].meanIndex - ref[1].meanIndex < EQUIVALENCE_MARGIN) {
    return {
      robustness: 'equivalent',
      note: `Les deux meilleurs créneaux sont à moins de ${EQUIVALENCE_MARGIN} points : équivalents.`,
    }
  }
  return {
    robustness: ref.length === 1 ? 'unique' : 'stable',
    note:
      ref.length === 1
        ? 'Un seul créneau atteint le seuil ; il reste le même quand on varie les poids.'
        : 'Le meilleur créneau reste le même quand on varie raisonnablement les poids et le seuil.',
  }
}
