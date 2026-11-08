import type { AnalysisExtent, GridCell, LandClass } from './types'
import { makeProjection } from './geo'
export interface SurveyCollection {
  type: 'FeatureCollection'
  features: { type: 'Feature'; properties: { landClass: LandClass | 'unknown'; score: number | null }; geometry: { type: 'Polygon'; coordinates: number[][][] } }[]
}
declare module './types' { interface SpatialAnalysis { survey?: SurveyCollection } }
type XY = { x: number; y: number }
/** Découpe chaque cellule au polygone circulaire inscrit ; aucune classe ou note inventée. */
export function buildSurvey(extent: AnalysisExtent, cellSizeM: number, cells: readonly GridCell[]): SurveyCollection {
  const projection = makeProjection(extent.center)
  const circle = Array.from({ length: 48 }, (_, i) => ({ x: extent.radiusM * Math.cos(i * Math.PI / 24), y: extent.radiusM * Math.sin(i * Math.PI / 24) }))
  const features: SurveyCollection['features'] = []
  for (const c of cells) {
    const x = -extent.radiusM + c.ix * cellSizeM, y = extent.radiusM - c.iy * cellSizeM
    let polygon: XY[] = [{ x, y }, { x, y: y - cellSizeM }, { x: x + cellSizeM, y: y - cellSizeM }, { x: x + cellSizeM, y }]
    for (let i = 0; i < circle.length && polygon.length; i++) {
      const a = circle[i], b = circle[(i + 1) % circle.length]
      const side = (p: XY) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
      const clipped: XY[] = []
      for (let j = 0; j < polygon.length; j++) {
        const s = polygon[j], e = polygon[(j + 1) % polygon.length], ds = side(s), de = side(e)
        if ((ds >= 0) !== (de >= 0)) { const t = ds / (ds - de); clipped.push({ x: s.x + t * (e.x - s.x), y: s.y + t * (e.y - s.y) }) }
        if (de >= 0) clipped.push(e)
      }
      polygon = clipped
    }
    if (polygon.length < 3) continue
    const ring = polygon.map((p) => { const q = projection.toCoordinate(p.x, p.y); return [q.lng, q.lat] })
    ring.push([...ring[0]])
    features.push({ type: 'Feature', properties: { landClass: c.landClass ?? 'unknown', score: c.score }, geometry: { type: 'Polygon', coordinates: [ring] } })
  }
  return { type: 'FeatureCollection', features }
}
