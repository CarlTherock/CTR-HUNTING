import type { Territory } from '@/types'

/** Which part of the data the lists and the map show. */
export type TerritoryFilter =
  | { kind: 'all' }
  | { kind: 'unclassified' }
  | { kind: 'archived' }
  | { kind: 'territory'; id: string }

export const ALL_TERRITORIES: TerritoryFilter = { kind: 'all' }

export const UNCLASSIFIED_LABEL = 'Non classé'

function findTerritory(
  territories: readonly Territory[],
  id: string | undefined,
): Territory | undefined {
  return id === undefined ? undefined : territories.find((t) => t.id === id)
}

/** Whether an item (identified by its `territoryId`) is shown by `filter`.
 * An item pointing to a territory that no longer exists is treated as
 * « Non classé » rather than silently disappearing. */
export function matchesTerritoryFilter(
  territoryId: string | undefined,
  filter: TerritoryFilter,
  territories: readonly Territory[],
): boolean {
  switch (filter.kind) {
    case 'all':
      return true
    case 'unclassified':
      return !findTerritory(territories, territoryId)
    case 'archived':
      return Boolean(findTerritory(territories, territoryId)?.archivedAt)
    case 'territory':
      return territoryId === filter.id
  }
}

export function filterItems<T extends { territoryId?: string }>(
  items: readonly T[],
  filter: TerritoryFilter,
  territories: readonly Territory[],
): T[] {
  if (filter.kind === 'all') return [...items]
  return items.filter((item) =>
    matchesTerritoryFilter(item.territoryId, filter, territories),
  )
}

/** The territory new items are filed in: the one the user has selected as
 * filter, if it exists and is not archived. Otherwise `undefined`
 * (« Non classé »). */
export function activeTerritoryIdFor(
  filter: TerritoryFilter,
  territories: readonly Territory[],
): string | undefined {
  if (filter.kind !== 'territory') return undefined
  const territory = findTerritory(territories, filter.id)
  return territory && !territory.archivedAt ? territory.id : undefined
}

/** Validates a filter read back from storage (it may be stale or corrupt). */
export function parseStoredFilter(
  value: unknown,
  territories: readonly Territory[],
): TerritoryFilter {
  if (typeof value !== 'object' || value === null) return ALL_TERRITORIES
  const record = value as { kind?: unknown; id?: unknown }
  switch (record.kind) {
    case 'unclassified':
      return { kind: 'unclassified' }
    case 'archived':
      return { kind: 'archived' }
    case 'territory': {
      if (typeof record.id !== 'string') return ALL_TERRITORIES
      const territory = findTerritory(territories, record.id)
      return territory && !territory.archivedAt
        ? { kind: 'territory', id: territory.id }
        : ALL_TERRITORIES
    }
    default:
      return ALL_TERRITORIES
  }
}

/** Value of the `<select>` for a filter (and back). */
export function filterToValue(filter: TerritoryFilter): string {
  return filter.kind === 'territory' ? `territory:${filter.id}` : filter.kind
}

export function filterFromValue(value: string): TerritoryFilter {
  if (value === 'unclassified') return { kind: 'unclassified' }
  if (value === 'archived') return { kind: 'archived' }
  if (value.startsWith('territory:')) {
    return { kind: 'territory', id: value.slice('territory:'.length) }
  }
  return ALL_TERRITORIES
}

export function filterLabel(
  filter: TerritoryFilter,
  territories: readonly Territory[],
): string {
  switch (filter.kind) {
    case 'all':
      return 'Tous les territoires'
    case 'unclassified':
      return UNCLASSIFIED_LABEL
    case 'archived':
      return 'Territoires archivés'
    case 'territory':
      return findTerritory(territories, filter.id)?.name ?? UNCLASSIFIED_LABEL
  }
}

/** « 3 éléments masqués par le filtre » */
export function hiddenByFilterMessage(count: number): string {
  return count === 1
    ? '1 élément masqué par le filtre'
    : `${count} éléments masqués par le filtre`
}

export function sortTerritories(territories: readonly Territory[]): Territory[] {
  return [...territories].sort((a, b) =>
    a.name.localeCompare(b.name, 'fr-CA', { sensitivity: 'base' }),
  )
}
