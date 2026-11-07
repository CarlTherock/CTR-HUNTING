import type { Coordinate } from '@/types'
import type { SpatialAnalysis } from './types'

/** Ce que la carte doit dessiner (GeoJSON simple, indépendant du moteur de carte). */
export interface HuntMapOverlay {
  sectors: {
    type: 'FeatureCollection'
    features: {
      type: 'Feature'
      properties: { id: string; rank: number; meanScore: number }
      geometry: { type: 'Polygon'; coordinates: number[][][] }
    }[]
  }
  candidates: {
    type: 'FeatureCollection'
    features: {
      type: 'Feature'
      properties: { id: string; grade: string; score: number }
      geometry: { type: 'Point'; coordinates: number[] }
    }[]
  }
  extent: Coordinate[]
}

const ring = (r: Coordinate[]) => {
  const pts = r.map((p) => [p.lng, p.lat])
  const first = pts[0]
  const last = pts[pts.length - 1]
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) pts.push(first)
  return pts
}

export function toOverlay(a: SpatialAnalysis): HuntMapOverlay {
  const circle: Coordinate[] = []
  for (let i = 0; i <= 48; i++) {
    const ang = (i / 48) * 2 * Math.PI
    circle.push({
      lat: a.extent.center.lat + (a.extent.radiusM / 111_320) * Math.cos(ang),
      lng:
        a.extent.center.lng +
        (a.extent.radiusM / (111_320 * Math.cos((a.extent.center.lat * Math.PI) / 180))) *
          Math.sin(ang),
    })
  }
  return {
    sectors: {
      type: 'FeatureCollection',
      features: a.sectors.map((s) => ({
        type: 'Feature',
        properties: { id: s.id, rank: s.rank, meanScore: s.meanScore },
        geometry: { type: 'Polygon', coordinates: s.rings.map(ring) },
      })),
    },
    candidates: {
      type: 'FeatureCollection',
      features: a.candidates.map((c) => ({
        type: 'Feature',
        properties: { id: c.id, grade: c.grade, score: c.score },
        geometry: { type: 'Point', coordinates: [c.coordinate.lng, c.coordinate.lat] },
      })),
    },
    extent: circle,
  }
}
