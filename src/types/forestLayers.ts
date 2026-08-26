/**
 * Real public Québec government map layers (Forêt ouverte / MRNF, and the
 * Québec cadastre) — the same kind of "cadastre + coupes forestières"
 * reference layers hunters look for on gouv.qc.ca's own Forêt ouverte
 * portal. Each is a real WMS (MRNF) or ArcGIS REST (cadastre) service,
 * added to the map as a raster overlay (`MapInstance.setRasterOverlay`),
 * never a fabricated boundary.
 */
export type ForestLayerId = 'cadastre' | 'coupes-forestieres' | 'peuplements-ecoforestiers'

export interface ForestLayerOption {
  id: ForestLayerId
  label: string
  description: string
}
