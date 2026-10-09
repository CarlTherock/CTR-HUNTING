import type { AnatomySheet, AnatomySource } from '../types'
import { sourceById } from './sources'

/** A sheet is shown only if every source it cites exists and has a title, a
 * publisher, a URL and a retrieval date. */
export function isSheetPublished(sheet: AnatomySheet): boolean {
  if (sheet.sourceIds.length === 0 || sheet.body.length === 0) return false
  return sheet.sourceIds.every((id) => {
    const source: AnatomySource | undefined = sourceById(id)
    return (
      source !== undefined &&
      source.title !== '' &&
      source.publisher !== '' &&
      source.url.startsWith('https://') &&
      source.retrievedOn !== ''
    )
  })
}
