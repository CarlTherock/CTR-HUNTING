import type { HuntAnalysis } from '@/features/deer-intel/engine/types'
import type { SpatialAnalysis } from '@/features/deer-intel/spatial/types'

/**
 * Analyse « Où et quand chasser » enregistrée pour consultation hors ligne. Contient tout ce
 * qu'il faut pour la relire sans réseau : point, étendue, période, version du moteur et du
 * registre, dates et sources des données, géométries des secteurs et points. Cache dérivé et
 * recalculable (comme les prévisions enregistrées) : exclu de la sauvegarde d'archive.
 */
export interface SavedHuntAnalysis {
  id: string
  /** ISO — enregistrement de cette analyse. */
  savedAt: string
  label: string
  /** Point + rayon, pour retrouver l'analyse d'un même endroit. */
  extentKey: string
  startDateKey: string
  days: number
  timezone: string
  /** Version du moteur et du registre ayant produit l'analyse. */
  engineVersion: string
  registryVersion: string
  hunt: HuntAnalysis
  spatial: SpatialAnalysis | null
  /** Dates et sources des données utilisées (null = donnée absente au moment du calcul). */
  data: {
    forecastFetchedAt: string | null
    forecastSource: string | null
    landCoverFetchedAt: string | null
    landCoverSource: string | null
  }
}
