import { addDays } from '@/features/hunting-hours/zonedTime'
import type { TerritoryState } from './territory'

/** Version affichée dans le rapport : toute règle ci-dessous change avec elle. */
export const METHOD_VERSION = 'reperes-saisonniers-0.1'

/**
 * Repère EXTERNE transféré avec prudence : étude du Wisconsin (résumé lu seulement), pic des
 * déplacements de mâles du 23 octobre au 12 novembre. Ces bornes restent celles de l'étude ;
 * elles ne sont jamais présentées comme des dates calculées du terrain québécois.
 */
export const EXTERNAL_REFERENCE = {
  startMonthDay: '10-23',
  endMonthDay: '11-12',
  /** Largeur (jours) du passage progressif de chaque côté des bornes de l'étude. */
  transitionDays: 14,
} as const

export type SeasonalStage = 'avant' | 'approche' | 'dans' | 'transition' | 'apres'

export const STAGE_LABEL: Record<SeasonalStage, string> = {
  avant: 'Avant le repère',
  approche: 'Approche du repère',
  dans: 'Dans le repère indicatif',
  transition: 'Après les bornes de l’étude externe',
  apres: 'Après le repère',
}

function key(year: number, monthDay: string): string {
  return `${year}-${monthDay}`
}

/**
 * Où se situe la date par rapport au repère externe. Le passage est progressif : deux semaines
 * d'« approche » avant et de « transition » après, pour ne jamais rendre un verdict biologique
 * rigide le lendemain d'une borne d'une autre région.
 */
export function seasonalStage(dateKey: string): SeasonalStage {
  const year = Number(dateKey.slice(0, 4))
  const start = key(year, EXTERNAL_REFERENCE.startMonthDay)
  const end = key(year, EXTERNAL_REFERENCE.endMonthDay)
  if (dateKey >= start && dateKey <= end) return 'dans'
  const t = EXTERNAL_REFERENCE.transitionDays
  if (dateKey < start) return dateKey >= addDays(start, -t) ? 'approche' : 'avant'
  return dateKey <= addDays(end, t) ? 'transition' : 'apres'
}

/** Contexte de reproduction du Québec (mois entiers, Québec.ca) : distinct du repère de déplacements. */
export function inQuebecBreedingMonths(dateKey: string): boolean {
  const m = Number(dateKey.slice(5, 7))
  return m === 11 || m === 12
}

export interface SeasonalAdvice {
  stage: SeasonalStage | null
  covered: boolean
  headline: string
  /** Ce que le contexte change (ou ne change pas) dans la recommandation. */
  effect: string
  /** Intérêt de prolonger une présence au-delà de l'aube et du crépuscule. */
  extendPresence: { status: 'option' | 'non_etaye' | 'non_applicable'; text: string }
  /** Le contexte permet-il de dire qu'un jour vaut mieux qu'un autre ? */
  dayRanking: string
  breedingContext: string | null
  limits: string
}

const EXTERNAL_LIMIT =
  'Repère du Wisconsin (résumé consulté seulement) : il mesure des déplacements de mâles, pas des dates de conception, et il n’est pas calibré pour votre terrain.'

export function seasonalAdvice(
  dateKey: string,
  territory: TerritoryState,
): SeasonalAdvice {
  if (territory === 'hors_territoire' || territory === 'madeleine') {
    return {
      stage: null,
      covered: false,
      headline: 'Territoire non couvert',
      effect:
        'Aucun repère saisonnier documenté pour ce point : aucun conseil de période n’est donné. Les heures solaires et la météo restent calculées.',
      extendPresence: { status: 'non_applicable', text: 'Sans objet.' },
      dayRanking: 'Aucun classement saisonnier des jours.',
      breedingContext: null,
      limits: 'Les repères québécois ne sont pas appliqués en dehors du Québec.',
    }
  }
  if (territory === 'anticosti') {
    return {
      stage: null,
      covered: false,
      headline: 'Anticosti : contexte particulier, non intégré',
      effect:
        'Les références disponibles situent l’accouplement à Anticosti plus tard que sur le continent (mi-novembre à janvier, citation de seconde main). Aucune période n’est calculée pour l’île.',
      extendPresence: { status: 'non_applicable', text: 'Sans objet.' },
      dayRanking: 'Aucun classement saisonnier des jours.',
      breedingContext: null,
      limits: 'Les repères du continent ne sont pas transférés à l’île.',
    }
  }
  const stage = seasonalStage(dateKey)
  const uncertain =
    territory === 'incertain'
      ? ' Le point est proche d’une limite du territoire : son appartenance au Québec n’est pas établie.'
      : ''
  const breeding = inQuebecBreedingMonths(dateKey)
    ? 'Au Québec, la reproduction se situe principalement en novembre et en décembre (Québec.ca) : contexte indicatif, pas une mesure de déplacements.'
    : null
  const base = { stage, covered: true, breedingContext: breeding, limits: EXTERNAL_LIMIT }
  switch (stage) {
    case 'dans':
      return {
        ...base,
        headline: 'Dans le repère indicatif (fin octobre à mi-novembre)',
        effect: `Contexte favorable aux sorties : l’étude externe mesure alors le plus de déplacements de mâles. Cela renforce l’intérêt de sortir à l’aube et au crépuscule, sans garantir de passage.${uncertain}`,
        extendPresence: {
          status: 'option',
          text: 'Des déplacements de mâles de jour sont rapportés pendant le pic (DNR Wisconsin, exemple d’un seul animal). Prolonger la présence en milieu de journée est une option raisonnable ; aucun pic de midi ni avantage sur l’aube et le crépuscule n’est démontré.',
        },
        dayRanking:
          'Tous les jours de cette période reçoivent le même contexte : il ne départage pas deux jours. Seules les conditions pratiques le font.',
      }
    case 'approche':
      return {
        ...base,
        headline: 'Approche du repère indicatif',
        effect: `Le repère externe commence dans moins de deux semaines. Rien ne permet de dire que les déplacements sont déjà élevés ou non ici.${uncertain}`,
        extendPresence: {
          status: 'non_etaye',
          text: 'À ce stade, le modèle dispose de moins d’éléments pour recommander une présence prolongée en journée.',
        },
        dayRanking:
          'Le contexte ne départage pas ces jours entre eux ; il distingue seulement, avec prudence, la proximité du repère.',
      }
    case 'transition':
      return {
        ...base,
        headline: 'Après les bornes de l’étude externe : aucun verdict',
        effect: `Le 12 novembre est une borne du Wisconsin, pas un « après-rut » québécois. Aucune donnée québécoise ne permet de dire si les déplacements diminuent ici. Le conseil reste prudent plutôt que de conclure.${uncertain}`,
        extendPresence: {
          status: 'non_etaye',
          text: 'Le modèle ne dispose pas d’éléments pour recommander de prolonger ou d’écourter la présence ; l’absence de repère n’indique pas que ces heures sont mauvaises.',
        },
        dayRanking: 'Le contexte ne départage pas ces jours.',
      }
    case 'avant':
    case 'apres':
    default:
      return {
        ...base,
        headline:
          stage === 'avant' ? 'Avant le repère indicatif' : 'Après le repère indicatif',
        effect: `Le repère externe ne s’applique pas à cette date. Le conseil repose sur les créneaux solaires et les conditions pratiques seulement.${uncertain}`,
        extendPresence: {
          status: 'non_etaye',
          text: 'Hors du repère de référence, le modèle dispose de moins d’éléments pour recommander une présence prolongée en journée.',
        },
        dayRanking:
          'Le contexte saisonnier ne change pas le classement des jours : seules les conditions pratiques les distinguent.',
      }
  }
}
