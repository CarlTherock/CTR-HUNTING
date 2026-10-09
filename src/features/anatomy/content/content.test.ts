import { describe, expect, it } from 'vitest'
import { ILLUSTRATIONS } from '../illustrations'
import { ANATOMY_SHEETS, generalSheets, sheetsFor } from './sheets'
import { isSheetPublished } from './publication'
import { ANATOMY_SOURCES, sourceById } from './sources'
import { NO_DELAY_NOTICE, POINT_2D_LIMIT } from './meta'

describe('anatomy content', () => {
  it('every published sheet cites existing sources with title, publisher, https URL and date', () => {
    for (const sheet of ANATOMY_SHEETS) {
      expect(isSheetPublished(sheet), sheet.id).toBe(true)
      for (const id of sheet.sourceIds) {
        const source = sourceById(id)
        expect(source, `${sheet.id} → ${id}`).toBeDefined()
        expect(source?.url.startsWith('https://')).toBe(true)
        expect(source?.retrievedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      }
    }
  })

  it('a sheet with no source, an unknown source or no text is not published', () => {
    const base = ANATOMY_SHEETS[0]
    if (!base) throw new Error('no sheet')
    expect(isSheetPublished({ ...base, sourceIds: [] })).toBe(false)
    expect(isSheetPublished({ ...base, sourceIds: ['inconnue'] })).toBe(false)
    expect(isSheetPublished({ ...base, body: [] })).toBe(false)
  })

  it('every sheet states context, uncertainty and applicability for both species', () => {
    for (const sheet of ANATOMY_SHEETS) {
      expect(sheet.context).not.toBe('')
      expect(sheet.uncertainty).not.toBe('')
      expect(sheet.applicability.deer).toBeDefined()
      expect(sheet.applicability.moose).toBeDefined()
    }
  })

  it('sheets only target regions that exist in both drawings', () => {
    for (const sheet of ANATOMY_SHEETS) {
      for (const regionId of sheet.regionIds) {
        for (const ill of Object.values(ILLUSTRATIONS)) {
          expect(
            ill.regions.some((r) => r.id === regionId),
            `${sheet.id}/${regionId}`,
          ).toBe(true)
        }
      }
    }
    expect(sheetsFor('thorax').length).toBeGreaterThan(0)
    expect(sheetsFor(null)).toEqual([])
    expect(generalSheets().length).toBeGreaterThan(0)
  })

  it('sheets about deer-only sources are flagged as unconfirmed for the moose', () => {
    const blood = ANATOMY_SHEETS.find((s) => s.id === 'indices-sang')
    expect(blood?.applicability.moose).toBe('non confirmé')
    const chest = ANATOMY_SHEETS.find((s) => s.id === 'zone-coeur-poumons')
    expect(chest?.applicability.moose).toBe('documenté')
  })

  it('contains no diagnosis, probability, numeric waiting time or countdown', () => {
    const text = ANATOMY_SHEETS.flatMap((s) => [
      s.title,
      ...s.body,
      s.context,
      s.uncertainty,
    ])
      .concat([NO_DELAY_NOTICE, POINT_2D_LIMIT])
      .join('\n')
    expect(text).not.toMatch(/organes? touchés?/i)
    expect(text).not.toMatch(/probabilit|chances? de survie/i)
    expect(text).not.toMatch(/\b\d+\s*(min|minutes|h|heures)\b/i)
    expect(text).not.toMatch(/compte à rebours\s*:/i)
  })

  it('the DeerCast pages describe the product, not anatomy: no sheet cites them', () => {
    expect(
      ANATOMY_SOURCES.some(
        (s) => s.url.includes('deercast') || s.url.includes('druryoutdoors'),
      ),
    ).toBe(false)
  })
})
