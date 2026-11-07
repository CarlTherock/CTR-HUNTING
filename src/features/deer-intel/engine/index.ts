import { ACTIVITY_RULE_IDS } from './activity'
import { CONDITION_RULE_IDS } from './conditions'
import { SOLUNAR_RULE_IDS } from './solunar'
import { COMBINE_RULE_IDS } from './windows'

export { analyzeHunt, LIMITS, MAX_DAYS } from './analyze'
export * from './types'
export { angularDifference, flowDegrees, normalizeDegrees } from './circular'
export { solarDay } from './sunDay'
export { moonDay, moonIsUp } from './moon'

/** Identifiants de règles exécutées par le moteur — comparés au registre par un test. */
export const IMPLEMENTED_RULE_IDS: readonly string[] = [
  ...ACTIVITY_RULE_IDS,
  ...CONDITION_RULE_IDS,
  ...COMBINE_RULE_IDS,
  ...SOLUNAR_RULE_IDS,
]
