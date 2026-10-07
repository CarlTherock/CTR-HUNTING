import type { DownloadSummary, OfflineArea } from '@/types'

/** What the UI shows, including the two states legacy records map to. */
export type EffectiveAreaStatus =
  | 'downloading'
  | 'complete'
  | 'complete-unverified'
  | 'incomplete'
  | 'interrupted'
  | 'error'

/**
 * Decides the stored status of a FINISHED sweep. `complete` is granted only
 * when nothing went wrong: every step reached `idle`, no request failed, no
 * style/sprite/glyph failure, and at least one tile is actually available.
 * Absent tiles (provider answered 404/204) do not count as failures.
 */
export function deriveAreaStatus(summary: DownloadSummary): 'complete' | 'incomplete' {
  const finishedAllSteps =
    summary.stepsTotal > 0 &&
    summary.stepsCompleted === summary.stepsTotal &&
    summary.stepsTimedOut === 0
  const clean =
    summary.failed === 0 &&
    summary.failures.length === 0 &&
    summary.essentialFailures.length === 0
  const hasTiles = summary.succeeded + summary.reused > 0
  return finishedAllSteps && clean && hasTiles ? 'complete' : 'incomplete'
}

/** Status to display. Records from older versions have no summary: a
 * `complete` one cannot be vouched for, a `cancelled` one is an interruption. */
export function effectiveAreaStatus(
  area: Pick<OfflineArea, 'status' | 'summary'>,
): EffectiveAreaStatus {
  switch (area.status) {
    case 'complete':
      return area.summary ? deriveAreaStatus(area.summary) : 'complete-unverified'
    case 'cancelled':
      return 'interrupted'
    default:
      return area.status
  }
}

export const AREA_STATUS_LABEL: Record<EffectiveAreaStatus, string> = {
  downloading: 'En cours',
  complete: 'Terminée',
  'complete-unverified': 'Terminée (ancienne version, non vérifiée)',
  incomplete: 'Incomplète',
  interrupted: 'Interrompue',
  error: 'Échec',
}

/** Areas the user can resume with "Réessayer le téléchargement". */
export function canRetryArea(area: Pick<OfflineArea, 'status' | 'summary'>): boolean {
  const status = effectiveAreaStatus(area)
  return status === 'incomplete' || status === 'interrupted' || status === 'error'
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Request-level progress — deliberately NOT a geographic coverage figure. */
export function describeRequests(summary: DownloadSummary): string {
  const ok = summary.succeeded + summary.reused
  const parts = [
    plural(ok, 'requête réussie', 'requêtes réussies'),
    plural(summary.failed + summary.essentialFailures.length, 'échec', 'échecs'),
  ]
  if (summary.absent > 0) {
    parts.push(plural(summary.absent, 'tuile absente', 'tuiles absentes'))
  }
  return parts.join(' · ')
}

export function describeSteps(summary: DownloadSummary): string {
  const base = `Balayage : ${summary.stepsCompleted}/${summary.stepsTotal} étapes`
  return summary.stepsTimedOut > 0
    ? `${base} · ${plural(summary.stepsTimedOut, 'étape expirée', 'étapes expirées')}`
    : base
}

/** Visible explanation of what a download is, and is not. */
export const OFFLINE_DOWNLOAD_EXPLANATION =
  'Le téléchargement balaie la caméra sur la zone cadrée, aux niveaux de zoom choisis, pour le fond de carte ACTIF, et enregistre les tuiles demandées par le moteur (ainsi que les couches superposées actuellement visibles, mais pas l’imagerie météo). « Terminée » signifie que toutes les requêtes du balayage ont réussi : ce n’est pas une garantie de couverture géographique tuile par tuile. Chaque zone est liée à un seul fond de carte et à la plage de zoom indiquée.'
