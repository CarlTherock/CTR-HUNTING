/**
 * Hunting-hours rules the app knows, with their source. Only ONE rule is
 * supported: the general Québec rule. Nothing here is a legal authorization:
 * the app computes a time window from the sun, it never says « chasse
 * autorisée ».
 *
 * The values below were read on the official Québec page (see `source`);
 * they are NOT updated by a weather download — they change only with a new
 * app version after a new verification (`verifiedOn`).
 */

export type HuntingRuleId = 'quebec-general'

export interface HuntingRuleSource {
  /** Page given as the starting source of the project (French version). */
  url: string
  title: string
  /** Page date shown by the publisher (« Dernière mise à jour »). */
  pageUpdatedOn: string
  /** Day this rule was last compared to the page. */
  verifiedOn: string
  note: string
}

export interface HuntingRule {
  id: HuntingRuleId
  jurisdiction: string
  title: string
  /** Minutes before sunrise at which the calculated window starts. */
  beforeSunriseMinutes: number
  /** Minutes after sunset at which the calculated window ends. */
  afterSunsetMinutes: number
  /** One-sentence rule, as applied. */
  summary: string
  /** Cases the official page lists where the general rule does NOT apply:
   * the app computes no window for them. */
  exceptions: string[]
  /** What the window never replaces. */
  reminders: string[]
  source: HuntingRuleSource
}

export const QUEBEC_GENERAL_RULE: HuntingRule = {
  id: 'quebec-general',
  jurisdiction: 'Québec',
  title: 'Québec — règle générale des heures de chasse',
  beforeSunriseMinutes: 30,
  afterSunsetMinutes: 30,
  summary:
    'Chasse permise de 30 minutes avant le lever du soleil jusqu’à 30 minutes après son coucher.',
  exceptions: [
    'Dindon sauvage : de 30 minutes avant le lever du soleil jusqu’à midi.',
    'Chasse au collet du lièvre et du lapin à queue blanche : aucune règle sur les heures de chasse.',
    'Chasse à la grenouille : aucune règle sur les heures de chasse.',
    'Raton laveur avec chiens (zones 4 à 8) : chasse de nuit possible sous conditions.',
  ],
  reminders: [
    'Les saisons, les zones de chasse, les espèces, les permis et les restrictions locales doivent être vérifiés séparément.',
    'Oiseaux migrateurs : les règles fédérales peuvent différer. Elles n’ont pas été vérifiées ici et ne sont pas prises en charge.',
    'Le lever et le coucher sont calculés par l’application (SunCalc) : ils peuvent différer de quelques minutes des tables officielles, qui prévalent.',
  ],
  source: {
    url: 'https://www.quebec.ca/tourisme-loisirs-sport/activites-sportives-et-de-plein-air/chasse-sportive/regles-generales/heures-chasse',
    title: 'Québec.ca — Heures de chasse',
    pageUpdatedOn: '2026-01-16',
    verifiedOn: '2026-11-02',
    note: 'Lue dans sa version anglaise (« Hunting times »), mise à jour le 16 janvier 2026 ; la page ne précise pas de lieu de référence et ne traite pas des oiseaux migrateurs.',
  },
}

export const HUNTING_RULES: Record<HuntingRuleId, HuntingRule> = {
  'quebec-general': QUEBEC_GENERAL_RULE,
}

/**
 * Generous rectangle around Québec, used ONLY to refuse the Québec rule for a
 * place that is plainly elsewhere (Europe, Alberta…). It cannot prove a place
 * is in Québec — border areas (Ontario, New Brunswick, Vermont, Labrador…)
 * fall inside it — which is why the rule is applied by itself only for a GPS
 * fix (and stays removable); otherwise the person must confirm it.
 */
export const QUEBEC_ENVELOPE = {
  south: 44.9,
  north: 62.7,
  west: -79.8,
  east: -57.0,
} as const

export function insideQuebecEnvelope(coordinate: { lat: number; lng: number }): boolean {
  return (
    coordinate.lat >= QUEBEC_ENVELOPE.south &&
    coordinate.lat <= QUEBEC_ENVELOPE.north &&
    coordinate.lng >= QUEBEC_ENVELOPE.west &&
    coordinate.lng <= QUEBEC_ENVELOPE.east
  )
}
