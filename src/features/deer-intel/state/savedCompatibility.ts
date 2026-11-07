import type { SavedHuntAnalysis } from '@/types'
import { ENGINE_VERSION } from '../engine/types'
import { RULE_REGISTRY_VERSION } from '../rules/registry'
import { extentKey } from '../spatial/extent'
import { SPATIAL_ENGINE_VERSION } from '../spatial/version'
import { inputsSignature, savedId, type HuntInputs } from './compose'

function sameSettings(record: SavedHuntAnalysis, inputs: HuntInputs): boolean {
  return record.id === savedId(record.extentKey, record.startDateKey, record.days, inputsSignature(inputs))
}

function currentSpatial(record: SavedHuntAnalysis, key: string): boolean {
  const spatial = record.spatial
  return spatial !== null && spatial.engineVersion === SPATIAL_ENGINE_VERSION &&
    record.extentKey === key && extentKey(spatial.extent) === key
}

/** Réutiliser un calcul spatial, jamais des géométries brutes inexistantes dans le cache. */
export function canReuseSpatial(record: SavedHuntAnalysis, inputs: HuntInputs, key: string): boolean {
  return sameSettings(record, inputs) && currentSpatial(record, key) &&
    record.spatial !== null && record.spatial.coverage > 0
}

/** Les anciennes analyses restent consultables par loadSaved, sans servir de nouveau résultat. */
export function canReuseSavedAnalysis(record: SavedHuntAnalysis, inputs: HuntInputs): boolean {
  return record.engineVersion === ENGINE_VERSION && record.hunt.engineVersion === ENGINE_VERSION &&
    record.registryVersion === RULE_REGISTRY_VERSION && record.hunt.registryVersion === RULE_REGISTRY_VERSION &&
    sameSettings(record, inputs) &&
    (record.spatial === null || currentSpatial(record, record.extentKey))
}
