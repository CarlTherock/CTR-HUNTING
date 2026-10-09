import type { ShotSpecies } from '@/types'

/** A point in the illustration's own units. */
export interface Point {
  x: number
  y: number
}

export interface ViewBox {
  x: number
  y: number
  w: number
  h: number
}

/** Where an illustration comes from and how far it can be trusted. Every
 * asset carries one; the screen shows it. */
export interface AssetProvenance {
  origin: string
  licence: string
  anatomicalReferences: readonly string[]
  validationLimits: string
}

export interface AnatomyRegion {
  id: string
  label: string
  /** Polygon in illustration units. Regions are checked in list order: the
   * first one containing the point wins. */
  polygon: readonly Point[]
  /** Where the point goes when the user picks the region from the list. */
  anchor: Point
  /** Structures drawn in this region of the schematic. */
  drawn: readonly string[]
  /** Structures the consulted sources mention for this kind of hit but that
   * the drawing does NOT locate. */
  mentioned: readonly string[]
}

export interface DrawnStructure {
  id: string
  label: string
  /** `ellipse` (cx, cy, rx, ry) or `path` (SVG path data). */
  shape:
    | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
    | { kind: 'path'; d: string }
  note: string
  /** Where its label is written, in illustration units. */
  labelAt: Point
  sourceIds: readonly string[]
}

export interface Illustration {
  id: string
  species: ShotSpecies
  view: 'lateral-left'
  viewLabel: string
  /** Bumped whenever a coordinate of the drawing changes: saved points keep
   * the version they were placed on. */
  version: string
  width: number
  height: number
  silhouette: readonly string[]
  /** Secondary shapes drawn lighter (far-side legs, ear, tail). */
  secondary: readonly string[]
  regions: readonly AnatomyRegion[]
  structures: readonly DrawnStructure[]
  provenance: AssetProvenance
}

export type SourceKind = 'officielle' | 'éducation' | 'média' | 'commerciale'

export interface AnatomySource {
  id: string
  title: string
  publisher: string
  kind: SourceKind
  url: string
  retrievedOn: string
  /** What the source covers and what it does not. */
  scope: string
}

export type Applicability = 'documenté' | 'non confirmé'

export type SheetKind =
  'anatomie' | 'observations' | 'indices' | 'organisation' | 'limites'

export interface AnatomySheet {
  id: string
  kind: SheetKind
  title: string
  /** Regions the sheet is shown for; empty = general sheet. */
  regionIds: readonly string[]
  /** Paragraphs in the project's own words. */
  body: readonly string[]
  /** Which species the source material is about. */
  applicability: Record<ShotSpecies, Applicability>
  /** Species and situation the statements come from. */
  context: string
  /** Where sources diverge or the statement is only a possibility. */
  uncertainty: string
  sourceIds: readonly string[]
}
