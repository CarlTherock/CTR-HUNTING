import { haversineMeters } from '@/utils/geo'
import { nearestSample } from '@/utils/windField'
import type { LngLatBounds } from '@/utils/tiles'
import type { Coordinate, VegetationSample, WindField } from '@/types'
import type { SourceState } from './types'

/**
 * Chargement GROUPÉ des données du comparateur — la seule partie
 * « réseau » de la fonctionnalité.
 *
 * - UNE grille de vent (qui contient aussi température, précipitations et
 *   nuages) et UNE requête de végétation pour l'emprise englobant les
 *   points choisis — jamais une requête par point ;
 * - changer d'heure ne demande RIEN (l'heure est lue dans la grille déjà
 *   chargée) ;
 * - cache mémoire à durée de vie courte, clé = emprise arrondie + jour ;
 * - les requêtes en cours sont partagées, et ANNULÉES (AbortSignal) dès que
 *   plus personne n'attend leur résultat (sélection modifiée) ;
 * - un vent déjà chargé par la carte est réutilisé s'il est assez récent et
 *   assez proche de chaque point.
 */

/** Durée de vie du cache mémoire (ms). */
export const CACHE_TTL_MS = 10 * 60_000
/** Pas d'arrondi de l'emprise (degrés, ≈ 5,5 km en latitude). */
export const BOUNDS_STEP_DEGREES = 0.05
/** Marge minimale autour des points (degrés) avant l'arrondi. */
export const BOUNDS_MIN_PADDING_DEGREES = 0.01
/** Grille de vent : 5×5 = 25 points, comme la couche de vent de la carte. */
export const WIND_GRID_SIZE = 5
/** Grille de végétation : 8×8, comme la carte de potentiel. */
export const VEGETATION_GRID_SIZE = 8
/** Au-delà, la requête de végétation (Overpass) est trop lourde : non demandée. */
export const MAX_VEGETATION_DIAGONAL_METERS = 40_000
/** Un vent déjà chargé n'est réutilisé que si chaque point a un point de
 * grille à cette distance ou moins. */
export const MAX_SHARED_SAMPLE_DISTANCE_METERS = 5_000

export function abortError(): DOMException {
  return new DOMException('Requête annulée', 'AbortError')
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

// --------------------------------------------------------------------- emprise

function roundCoord(value: number): number {
  return Math.round(value * 1000) / 1000
}

/** Emprise englobant `coordinates`, élargie puis arrondie VERS L'EXTÉRIEUR
 * au pas `BOUNDS_STEP_DEGREES` : deux sélections proches donnent la même
 * emprise (donc la même clé de cache), et elle contient toujours les points. */
export function compareBounds(coordinates: Coordinate[]): LngLatBounds {
  const lats = coordinates.map((c) => c.lat)
  const lngs = coordinates.map((c) => c.lng)
  const pad = BOUNDS_MIN_PADDING_DEGREES
  const step = BOUNDS_STEP_DEGREES
  const down = (v: number) => roundCoord(Math.floor((v + 1e-9) / step) * step)
  const up = (v: number) => roundCoord(Math.ceil((v - 1e-9) / step) * step)
  return {
    south: down(Math.min(...lats) - pad),
    north: up(Math.max(...lats) + pad),
    west: down(Math.min(...lngs) - pad),
    east: up(Math.max(...lngs) + pad),
  }
}

export function boundsKey(bounds: LngLatBounds, dayKey: string): string {
  const f = (n: number) => n.toFixed(2)
  return `${f(bounds.south)},${f(bounds.west)},${f(bounds.north)},${f(bounds.east)}@${dayKey}`
}

export function boundsDiagonalMeters(bounds: LngLatBounds): number {
  return haversineMeters(
    { lat: bounds.south, lng: bounds.west },
    { lat: bounds.north, lng: bounds.east },
  )
}

// ----------------------------------------------------------------------- cache

type Entry<T> =
  | {
      state: 'pending'
      promise: Promise<{ value: T; fetchedAtMs: number }>
      controller: AbortController
      waiters: number
    }
  | { state: 'done'; value: T; fetchedAtMs: number; expiresAtMs: number }

export interface CacheResult<T> {
  value: T
  fetchedAtMs: number
  fromCache: boolean
}

/** Cache en mémoire avec partage des requêtes en cours et annulation
 * quand plus personne n'attend. Les erreurs ne sont jamais mises en cache. */
export class RequestCache<T> {
  private entries = new Map<string, Entry<T>>()
  private readonly ttlMs: number
  private readonly nowMs: () => number

  constructor(ttlMs: number, nowMs: () => number) {
    this.ttlMs = ttlMs
    this.nowMs = nowMs
  }

  get size(): number {
    return this.entries.size
  }

  clear(): void {
    this.entries.clear()
  }

  get(
    key: string,
    fetcher: (signal: AbortSignal) => Promise<T>,
    signal: AbortSignal,
  ): Promise<CacheResult<T>> {
    if (signal.aborted) return Promise.reject(abortError())
    let entry = this.entries.get(key)
    if (entry?.state === 'done') {
      if (entry.expiresAtMs > this.nowMs()) {
        return Promise.resolve({
          value: entry.value,
          fetchedAtMs: entry.fetchedAtMs,
          fromCache: true,
        })
      }
      this.entries.delete(key)
      entry = undefined
    }

    let pending: Extract<Entry<T>, { state: 'pending' }>
    if (entry?.state === 'pending') {
      pending = entry
    } else {
      const controller = new AbortController()
      const created: Extract<Entry<T>, { state: 'pending' }> = {
        state: 'pending',
        controller,
        waiters: 0,
        promise: undefined as never,
      }
      created.promise = fetcher(controller.signal).then(
        (value) => {
          const fetchedAtMs = this.nowMs()
          if (this.entries.get(key) === created) {
            this.entries.set(key, {
              state: 'done',
              value,
              fetchedAtMs,
              expiresAtMs: fetchedAtMs + this.ttlMs,
            })
          }
          return { value, fetchedAtMs }
        },
        (error: unknown) => {
          if (this.entries.get(key) === created) this.entries.delete(key)
          throw error
        },
      )
      // L'erreur est relayée à chaque attente ; ce `catch` évite seulement un
      // rejet non géré quand tous les attendants ont été annulés.
      created.promise.catch(() => undefined)
      this.entries.set(key, created)
      pending = created
    }

    pending.waiters++
    return new Promise<CacheResult<T>>((resolve, reject) => {
      const onAbort = () => {
        pending.waiters--
        if (pending.waiters <= 0 && this.entries.get(key) === pending) {
          this.entries.delete(key)
          pending.controller.abort()
        }
        reject(abortError())
      }
      signal.addEventListener('abort', onAbort, { once: true })
      pending.promise.then(
        (result) => {
          signal.removeEventListener('abort', onAbort)
          resolve({ ...result, fromCache: false })
        },
        (error: unknown) => {
          signal.removeEventListener('abort', onAbort)
          reject(error)
        },
      )
    })
  }
}

// ---------------------------------------------------------------------- loader

/** Un vent déjà chargé ailleurs dans l'application (couche de vent de la
 * carte, carte de potentiel). */
export interface SharedWindCandidate {
  field: WindField
  fetchedAt: string
  /** D'où il vient (affiché). */
  origin: string
}

export interface CompareDataDeps {
  fetchWind: (
    bounds: LngLatBounds,
    gridSize: number,
    signal: AbortSignal,
  ) => Promise<WindField>
  fetchVegetation: (
    bounds: LngLatBounds,
    gridSize: number,
    signal: AbortSignal,
  ) => Promise<VegetationSample[]>
  nowMs: () => number
  sharedWind: () => SharedWindCandidate[]
}

export type DataOrigin = 'network' | 'cache' | 'map'

export interface CompareDataset {
  key: string
  bounds: LngLatBounds
  windField: WindField | null
  wind: SourceState
  windOrigin: DataOrigin | null
  windOriginLabel: string | null
  vegetation: VegetationSample[] | null
  vegetationState: SourceState
  vegetationOrigin: DataOrigin | null
}

function describeError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'erreur inconnue'
}

/** Candidat de vent réutilisable : récent ET proche de chaque point. */
export function findReusableWind(
  coordinates: Coordinate[],
  candidates: SharedWindCandidate[],
  nowMs: number,
): SharedWindCandidate | null {
  for (const candidate of candidates) {
    const age = nowMs - new Date(candidate.fetchedAt).getTime()
    if (!Number.isFinite(age) || age < 0 || age > CACHE_TTL_MS) continue
    const covers = coordinates.every((c) => {
      const sample = nearestSample(candidate.field, c)
      return (
        sample !== null &&
        haversineMeters(c, sample.coordinate) <= MAX_SHARED_SAMPLE_DISTANCE_METERS
      )
    })
    if (covers) return candidate
  }
  return null
}

export class CompareDataLoader {
  private windCache: RequestCache<WindField>
  private vegetationCache: RequestCache<VegetationSample[]>
  private readonly deps: CompareDataDeps

  constructor(deps: CompareDataDeps) {
    this.deps = deps
    this.windCache = new RequestCache(CACHE_TTL_MS, deps.nowMs)
    this.vegetationCache = new RequestCache(CACHE_TTL_MS, deps.nowMs)
  }

  clearCache(): void {
    this.windCache.clear()
    this.vegetationCache.clear()
  }

  /**
   * Charge le vent et la végétation de l'emprise des `coordinates`. Ne
   * rejette QUE pour une annulation (`AbortError`) ; une erreur de
   * fournisseur devient l'état `error` de la source concernée.
   */
  async load(coordinates: Coordinate[], signal: AbortSignal): Promise<CompareDataset> {
    if (signal.aborted) throw abortError()
    const bounds = compareBounds(coordinates)
    const dayKey = new Date(this.deps.nowMs()).toISOString().slice(0, 10)
    const key = boundsKey(bounds, dayKey)
    const { deps } = this

    const shared = findReusableWind(coordinates, deps.sharedWind(), deps.nowMs())

    const windPromise: Promise<
      | {
          ok: true
          field: WindField
          fetchedAtMs: number
          origin: DataOrigin
          label: string | null
        }
      | { ok: false; error: unknown }
    > = shared
      ? Promise.resolve({
          ok: true as const,
          field: shared.field,
          fetchedAtMs: new Date(shared.fetchedAt).getTime(),
          origin: 'map' as const,
          label: shared.origin,
        })
      : this.windCache
          .get(`wind:${key}`, (s) => deps.fetchWind(bounds, WIND_GRID_SIZE, s), signal)
          .then(
            (r) => ({
              ok: true as const,
              field: r.value,
              fetchedAtMs: r.fetchedAtMs,
              origin: (r.fromCache ? 'cache' : 'network') as DataOrigin,
              label: null,
            }),
            (error: unknown) => ({ ok: false as const, error }),
          )

    const tooLarge = boundsDiagonalMeters(bounds) > MAX_VEGETATION_DIAGONAL_METERS
    const vegetationPromise = tooLarge
      ? Promise.resolve(null)
      : this.vegetationCache
          .get(
            `veg:${key}`,
            (s) => deps.fetchVegetation(bounds, VEGETATION_GRID_SIZE, s),
            signal,
          )
          .then(
            (r) => ({ ok: true as const, ...r }),
            (error: unknown) => ({ ok: false as const, error }),
          )

    const [windResult, vegetationResult] = await Promise.all([
      windPromise,
      vegetationPromise,
    ])
    if (signal.aborted) throw abortError()
    for (const result of [windResult, vegetationResult]) {
      if (result && !result.ok && isAbortError(result.error)) throw abortError()
    }

    const dataset: CompareDataset = {
      key,
      bounds,
      windField: null,
      wind: { status: 'error', reason: 'inconnue' },
      windOrigin: null,
      windOriginLabel: null,
      vegetation: null,
      vegetationState: { status: 'error', reason: 'inconnue' },
      vegetationOrigin: null,
    }

    if (windResult.ok) {
      dataset.windField = windResult.field
      dataset.wind = {
        status: 'ok',
        fetchedAt: new Date(windResult.fetchedAtMs).toISOString(),
      }
      dataset.windOrigin = windResult.origin
      dataset.windOriginLabel = windResult.label
    } else {
      dataset.wind = { status: 'error', reason: describeError(windResult.error) }
    }

    if (vegetationResult === null) {
      dataset.vegetationState = {
        status: 'skipped',
        reason: `emprise trop étendue (plus de ${MAX_VEGETATION_DIAGONAL_METERS / 1000} km entre les points) : habitat non évalué.`,
      }
    } else if (vegetationResult.ok) {
      dataset.vegetation = vegetationResult.value
      dataset.vegetationState = {
        status: 'ok',
        fetchedAt: new Date(vegetationResult.fetchedAtMs).toISOString(),
      }
      dataset.vegetationOrigin = vegetationResult.fromCache ? 'cache' : 'network'
    } else {
      dataset.vegetationState = {
        status: 'error',
        reason: describeError(vegetationResult.error),
      }
    }
    return dataset
  }
}
