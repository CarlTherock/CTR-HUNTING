/**
 * A territory is a purely logical folder used to organise waypoints, tracks
 * and journal entries (« Secteur nord », « Lot du lac »…). It has NO
 * geographic extent: no polygon, no bounding box. An item belongs to at most
 * one territory; an item without `territoryId` is « Non classé ».
 */
export interface Territory {
  id: string
  name: string
  createdAt: string // ISO 8601
  updatedAt: string // ISO 8601
  /** Set when archived: the territory is hidden from active pickers but
   * keeps all its content. Cleared on restore. */
  archivedAt?: string // ISO 8601
  notes?: string
}
