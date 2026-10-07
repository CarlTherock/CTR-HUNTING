/**
 * Calculs sur de grosses collections sans bloquer l'interface : le travail
 * est découpé en tranches de durée bornée, on rend la main au navigateur
 * entre deux tranches, et un calcul périmé (nouvelle demande, page
 * quittée) est annulé par un `AbortSignal`.
 */

export interface ChunkOptions {
  signal?: AbortSignal
  /** Durée maximale d'une tranche avant de rendre la main (ms). */
  budgetMs?: number
  /** Horloge (injectable pour les tests). */
  now?: () => number
  /** Cède la main (injectable pour les tests). */
  yieldFn?: () => Promise<void>
}

export const DEFAULT_BUDGET_MS = 8

export function abortError(): DOMException {
  return new DOMException('Calcul annulé', 'AbortError')
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError()
}

/** Rend la main à la boucle d'événements (le rendu et les saisies passent). */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Applique `fn` à chaque élément, par tranches de `budgetMs`. L'ordre est
 * conservé. Rejette avec une `AbortError` dès que le signal est annulé.
 * Les éléments pour lesquels `fn` renvoie `undefined` sont omis.
 */
export async function mapInChunks<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => R | undefined,
  options: ChunkOptions = {},
): Promise<R[]> {
  const { signal, budgetMs = DEFAULT_BUDGET_MS } = options
  const now = options.now ?? (() => performance.now())
  const yieldFn = options.yieldFn ?? yieldToEventLoop
  const out: R[] = []
  let sliceStart = now()
  for (let i = 0; i < items.length; i += 1) {
    throwIfAborted(signal)
    const value = fn(items[i], i)
    if (value !== undefined) out.push(value)
    if (now() - sliceStart >= budgetMs) {
      await yieldFn()
      throwIfAborted(signal)
      sliceStart = now()
    }
  }
  throwIfAborted(signal)
  return out
}
