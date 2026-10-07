import { describe, expect, it } from 'vitest'
import {
  activeTerritoryIdFor,
  filterFromValue,
  filterItems,
  filterToValue,
  hiddenByFilterMessage,
  matchesTerritoryFilter,
  parseStoredFilter,
} from './filter'
import type { Territory } from '@/types'

const NORD: Territory = {
  id: 'nord',
  name: 'Nord',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
}
const VIEUX: Territory = {
  id: 'vieux',
  name: 'Vieux lot',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  archivedAt: '2026-10-02T00:00:00.000Z',
}
const TERRITORIES = [NORD, VIEUX]

const ITEMS = [
  { id: 'a', territoryId: 'nord' },
  { id: 'b', territoryId: 'vieux' },
  { id: 'c' },
  { id: 'd', territoryId: 'disparu' }, // points to a territory that no longer exists
]
const ids = (items: { id: string }[]) => items.map((i) => i.id)

describe('territory filter', () => {
  it('« Tous » shows everything', () => {
    expect(ids(filterItems(ITEMS, { kind: 'all' }, TERRITORIES))).toEqual([
      'a',
      'b',
      'c',
      'd',
    ])
  })

  it('a territory shows only its own items', () => {
    expect(
      ids(filterItems(ITEMS, { kind: 'territory', id: 'nord' }, TERRITORIES)),
    ).toEqual(['a'])
  })

  it('« Non classé » shows items without territory and with a dangling territory', () => {
    expect(ids(filterItems(ITEMS, { kind: 'unclassified' }, TERRITORIES))).toEqual([
      'c',
      'd',
    ])
  })

  it('« Archivés » shows the content of archived territories only', () => {
    expect(ids(filterItems(ITEMS, { kind: 'archived' }, TERRITORIES))).toEqual(['b'])
  })

  it('matchesTerritoryFilter agrees with filterItems', () => {
    expect(matchesTerritoryFilter(undefined, { kind: 'unclassified' }, TERRITORIES)).toBe(
      true,
    )
    expect(matchesTerritoryFilter('nord', { kind: 'unclassified' }, TERRITORIES)).toBe(
      false,
    )
  })

  it('new items inherit the selected, non-archived territory only', () => {
    expect(activeTerritoryIdFor({ kind: 'territory', id: 'nord' }, TERRITORIES)).toBe(
      'nord',
    )
    expect(
      activeTerritoryIdFor({ kind: 'territory', id: 'vieux' }, TERRITORIES),
    ).toBeUndefined()
    expect(
      activeTerritoryIdFor({ kind: 'territory', id: 'inconnu' }, TERRITORIES),
    ).toBeUndefined()
    expect(activeTerritoryIdFor({ kind: 'all' }, TERRITORIES)).toBeUndefined()
    expect(activeTerritoryIdFor({ kind: 'unclassified' }, TERRITORIES)).toBeUndefined()
    expect(activeTerritoryIdFor({ kind: 'archived' }, TERRITORIES)).toBeUndefined()
  })

  it('validates a stored filter and falls back to « Tous »', () => {
    expect(parseStoredFilter({ kind: 'territory', id: 'nord' }, TERRITORIES)).toEqual({
      kind: 'territory',
      id: 'nord',
    })
    expect(parseStoredFilter({ kind: 'territory', id: 'vieux' }, TERRITORIES)).toEqual({
      kind: 'all',
    })
    expect(parseStoredFilter({ kind: 'territory', id: 'x' }, TERRITORIES)).toEqual({
      kind: 'all',
    })
    expect(parseStoredFilter({ kind: 'unclassified' }, TERRITORIES)).toEqual({
      kind: 'unclassified',
    })
    expect(parseStoredFilter({ kind: 'archived' }, TERRITORIES)).toEqual({
      kind: 'archived',
    })
    expect(parseStoredFilter('garbage', TERRITORIES)).toEqual({ kind: 'all' })
    expect(parseStoredFilter(null, TERRITORIES)).toEqual({ kind: 'all' })
    expect(parseStoredFilter({ kind: 'territory' }, TERRITORIES)).toEqual({ kind: 'all' })
  })

  it('round-trips through the select value', () => {
    for (const filter of [
      { kind: 'all' },
      { kind: 'unclassified' },
      { kind: 'archived' },
      { kind: 'territory', id: 'nord' },
    ] as const) {
      expect(filterFromValue(filterToValue(filter))).toEqual(filter)
    }
  })

  it('words the hidden-items message in French with the right plural', () => {
    expect(hiddenByFilterMessage(1)).toBe('1 élément masqué par le filtre')
    expect(hiddenByFilterMessage(3)).toBe('3 éléments masqués par le filtre')
  })
})
