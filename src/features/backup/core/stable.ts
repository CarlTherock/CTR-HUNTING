/**
 * Deterministic JSON: object keys sorted, `undefined` members dropped (as
 * JSON itself does). Two records are « identical » for the restore policy
 * when their stable strings are equal, whatever the key order or whether an
 * optional field is absent or explicitly `undefined`.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value)) ?? 'null'
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(source).sort()) {
      if (source[key] !== undefined) out[key] = sortKeys(source[key])
    }
    return out
  }
  return value
}
