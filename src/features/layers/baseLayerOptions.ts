import type { MapBaseLayerId, MapBaseLayerOption } from '@/types'

export const MAPTILER_LAYERS: MapBaseLayerOption[] = [
  { id: 'outdoor', label: 'Plein air (topo)' },
  { id: 'satellite', label: 'Satellite' },
]

export const ESRI_LAYERS: MapBaseLayerOption[] = [
  { id: 'esri-topographic', label: 'Topographique' },
  { id: 'esri-imagery', label: 'Imagerie hybride' },
  { id: 'esri-imagery-standard', label: 'Imagerie' },
  { id: 'esri-terrain', label: 'Relief' },
  { id: 'esri-hillshade', label: 'Ombrage du relief' },
  { id: 'esri-light-gray', label: 'Gris clair' },
  { id: 'esri-dark-gray', label: 'Gris foncé' },
  { id: 'esri-navigation', label: 'Navigation' },
]

/** French label of a base layer (falls back to the raw id). */
export function baseLayerLabel(id: MapBaseLayerId): string {
  return [...MAPTILER_LAYERS, ...ESRI_LAYERS].find((l) => l.id === id)?.label ?? id
}
