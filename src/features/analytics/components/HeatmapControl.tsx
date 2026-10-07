import { LayoutGrid, X } from 'lucide-react'
import { ToolTrigger } from '@/components/map-tools'
import { analysisHeatmapColor } from '@/utils/analysisHeatmapColors'
import { formatCellMeters } from '@/utils/grid'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { useHeatmapStore } from '../state/heatmapStore'
import { HeatmapCellSheet } from './HeatmapCellSheet'
import { HourSelect } from './HourSelect'
import { PANEL_BOX_COMPACT, PANEL_WRAPPER } from './panelLayout'
import type { HeatmapView } from '../state/heatmapStore'
import type { Coordinate } from '@/types'
import type { LngLatBounds } from '@/utils/tiles'

export interface HeatmapControlProps {
  getBounds: () => LngLatBounds | null
  queryElevation: (coordinate: Coordinate) => number | null
  /** Current map center — to detect that the user panned away from the
   * analyzed area and offer a recompute. */
  viewCenter?: Coordinate
}

/** Au-delà de cette taille de cellule, la zone est trop large pour une
 * lecture « de terrain » : on le dit plutôt que de laisser croire à une
 * précision locale. */
const COARSE_CELL_METERS = 4000

const VIEW_OPTIONS: { value: HeatmapView; label: string; group?: string }[] = [
  { value: 'combined', label: 'Indice combiné (repère)' },
  {
    value: 'habitat',
    label: 'Famille Habitat (terrain + végétation)',
    group: 'Familles',
  },
  {
    value: 'conditions',
    label: 'Famille Conditions (vent + météo + moment)',
    group: 'Familles',
  },
  {
    value: 'observations',
    label: 'Famille Observations (vos données)',
    group: 'Familles',
  },
  { value: 'terrain', label: 'Terrain', group: 'Un seul groupe' },
  { value: 'vegetation', label: 'Végétation', group: 'Un seul groupe' },
  { value: 'weather', label: 'Météo (commune à la zone)', group: 'Un seul groupe' },
  { value: 'wind', label: 'Vent', group: 'Un seul groupe' },
  {
    value: 'time',
    label: 'Moment (indice populaire non vérifié)',
    group: 'Un seul groupe',
  },
  {
    value: 'history',
    label: 'Historique (indices de gibier saisis)',
    group: 'Un seul groupe',
  },
]

/** A 5-stop preview of `analysisHeatmapColor`'s red→green scale, for a
 * legend bar — not a separate hand-picked palette. */
function legendGradient(): string {
  const stops = [0, 25, 50, 75, 100].map(
    (v, i) => `${analysisHeatmapColor(v, 1)} ${(i / 4) * 100}%`,
  )
  return `linear-gradient(to right, ${stops.join(', ')})`
}

function LegendSwatch({ kind }: { kind: 'partial' | 'nodata' }) {
  const style =
    kind === 'partial'
      ? {
          background: `repeating-linear-gradient(135deg, rgba(20,20,20,0.55) 0 1.5px, ${analysisHeatmapColor(65, 0.28)} 1.5px 5px)`,
          border: '1px solid rgba(255,255,255,0.28)',
        }
      : {
          background:
            'radial-gradient(circle, rgba(240,240,240,0.7) 1px, rgba(120,120,120,0.18) 1.5px) 0 0 / 5px 5px',
          border: '1px dashed rgba(230,230,230,0.6)',
        }
  return (
    <span
      aria-hidden="true"
      className="inline-block size-4 shrink-0 rounded-sm"
      style={style}
    />
  )
}

/**
 * Carte de potentiel. Colore la zone visible, une vraie cellule par point de
 * grille (mêmes analyseurs que « Analyser cet endroit »), en TROIS familles
 * séparées — Habitat, Conditions, Observations — plus un indice combiné de
 * repère. Ce n'est JAMAIS une probabilité de présence, de déplacement ou de
 * récolte. Une cellule sans donnée est dessinée autrement (motif) qu'une
 * cellule peu favorable (couleur basse), et une cellule partiellement
 * renseignée est hachurée.
 */
export function HeatmapControl({
  getBounds,
  queryElevation,
  viewCenter,
}: HeatmapControlProps) {
  const enabled = useHeatmapStore((state) => state.enabled)
  const status = useHeatmapStore((state) => state.status)
  const errorReason = useHeatmapStore((state) => state.errorReason)
  const selectedView = useHeatmapStore((state) => state.selectedView)
  const setSelectedView = useHeatmapStore((state) => state.setSelectedView)
  const toggle = useHeatmapStore((state) => state.toggle)
  const compute = useHeatmapStore((state) => state.compute)
  const computedBounds = useHeatmapStore((state) => state.computedBounds)
  const unavailableSources = useHeatmapStore((state) => state.unavailableSources)
  const cellSize = useHeatmapStore((state) => state.cellSize)
  const gridSize = useHeatmapStore((state) => state.gridSize)
  const selectedCellIndex = useHeatmapStore((state) => state.selectedCellIndex)
  // Pendant la création/modification d'un waypoint, son panneau occupe le
  // bas de l'écran : le nôtre s'efface (la couche reste affichée sur la carte).
  const waypointPanelOpen = useWaypointsStore(
    (state) => state.draft !== null || state.editingId !== null,
  )
  const areaChanged =
    status === 'ready' &&
    !!computedBounds &&
    !!viewCenter &&
    (viewCenter.lat > computedBounds.north ||
      viewCenter.lat < computedBounds.south ||
      viewCenter.lng > computedBounds.east ||
      viewCenter.lng < computedBounds.west)

  function handleToggle() {
    const bounds = getBounds()
    if (bounds) toggle(bounds, queryElevation)
  }

  function refresh() {
    const bounds = getBounds()
    if (bounds) void compute(bounds, queryElevation)
  }

  const coarse =
    cellSize !== null &&
    Math.max(cellSize.widthMeters, cellSize.heightMeters) > COARSE_CELL_METERS
  const groups = ['Familles', 'Un seul groupe']

  return (
    <>
      <ToolTrigger
        label="Carte de potentiel"
        icon={<LayoutGrid size={18} aria-hidden="true" />}
        onClick={handleToggle}
        pressed={enabled}
        active={enabled}
        order={41}
      />

      {enabled &&
        !waypointPanelOpen &&
        status === 'ready' &&
        selectedCellIndex !== null && <HeatmapCellSheet />}

      {enabled &&
        !waypointPanelOpen &&
        !(status === 'ready' && selectedCellIndex !== null) && (
          <div className={PANEL_WRAPPER}>
            <div
              data-testid="heatmap-panel"
              className={`${PANEL_BOX_COMPACT} bg-surface-900/95 p-3`}
            >
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-ink-100 text-sm font-semibold">Carte de potentiel</h2>
                <button
                  type="button"
                  onClick={handleToggle}
                  aria-label="Masquer la carte de potentiel"
                  className="text-ink-500 hover:text-ink-100 flex items-center justify-center pointer-coarse:size-11"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>

              {status === 'loading' && (
                <p className="text-ink-500 text-sm">Analyse de la zone…</p>
              )}
              {status === 'error' && (
                <p className="text-status-danger text-sm">
                  Carte indisponible — {errorReason}.{' '}
                  <button
                    type="button"
                    onClick={refresh}
                    className="underline pointer-coarse:min-h-11"
                  >
                    Réessayer
                  </button>
                </p>
              )}
              {status === 'ready' && (
                <>
                  <p className="text-ink-300 mb-2 text-xs">
                    Analyse environnementale générale — aucun profil d’espèce.
                  </p>
                  <label className="mb-2 flex flex-col gap-1">
                    <span className="text-ink-500 text-xs font-medium">
                      Score affiché
                    </span>
                    <select
                      value={selectedView}
                      onChange={(e) => setSelectedView(e.target.value as HeatmapView)}
                      aria-label="Score affiché"
                      className="border-surface-600 bg-surface-800 text-ink-100 focus-visible:outline-brand-400 w-full rounded-md border px-2 py-1.5 text-sm outline-none focus-visible:outline-2 pointer-coarse:min-h-11"
                    >
                      {VIEW_OPTIONS.filter((o) => !o.group).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                      {groups.map((group) => (
                        <optgroup key={group} label={group}>
                          {VIEW_OPTIONS.filter((o) => o.group === group).map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                  <div className="mb-2">
                    <HourSelect id="heatmap-hour" />
                  </div>
                  {areaChanged && (
                    <div className="bg-status-warning/15 text-status-warning mb-2 flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs">
                      <span>La carte a bougé hors de la zone analysée.</span>
                      <button
                        type="button"
                        onClick={refresh}
                        className="font-semibold underline pointer-coarse:min-h-11"
                      >
                        Recalculer
                      </button>
                    </div>
                  )}
                  {unavailableSources.length > 0 && (
                    <p className="text-ink-500 mb-2 text-xs">
                      Indisponible pour l'instant : {unavailableSources.join(', ')} — ces
                      analyseurs sont exclus du score.
                    </p>
                  )}
                  <div
                    className="h-2 w-full rounded-full"
                    style={{ background: legendGradient() }}
                    aria-hidden="true"
                  />
                  <div className="text-ink-500 mt-0.5 flex justify-between text-[10px]">
                    <span>Défavorable</span>
                    <span>Neutre</span>
                    <span>Favorable</span>
                  </div>
                  <ul className="text-ink-500 mt-2 flex flex-col gap-1 text-xs">
                    <li className="flex items-center gap-2">
                      <LegendSwatch kind="partial" />
                      Hachurée : donnée environnementale manquante pour cette cellule.
                    </li>
                    <li className="flex items-center gap-2">
                      <LegendSwatch kind="nodata" />
                      Pointillée : aucune donnée (≠ peu favorable, qui est en rouge).
                    </li>
                  </ul>
                  <p className="text-ink-300 mt-2 text-xs">
                    Indice de repère comparatif entre cellules — pas une probabilité de
                    présence, de déplacement ni de récolte.
                  </p>
                  {cellSize && (
                    <p className="text-ink-500 mt-1 text-xs">
                      Cellules ≈ {formatCellMeters(cellSize.widthMeters)} ×{' '}
                      {formatCellMeters(cellSize.heightMeters)} ({gridSize} × {gridSize}).
                      {coarse &&
                        ' Zone très large : zoomez pour une lecture plus locale.'}{' '}
                      Touchez une cellule pour sa fiche.
                    </p>
                  )}
                  <details className="mt-1">
                    <summary className="text-ink-500 hover:text-ink-100 flex cursor-pointer items-center text-xs underline pointer-coarse:min-h-11">
                      À propos de cette carte
                    </summary>
                    <div className="text-ink-500 mt-1 flex flex-col gap-1 text-xs">
                      <p>
                        Météo : une seule valeur, prise au centre de la zone et commune à
                        toutes les cellules — elle ne montre aucune variation locale.
                      </p>
                      <p>
                        Vent : valeur du point de grille le plus proche (une requête
                        groupée), sans interpolation. Végétation : OpenStreetMap, un
                        polygone est compté dans la cellule la plus proche de son centre.
                      </p>
                      <p>
                        Règle : moyenne simple des facteurs comptés (poids 1) ; l’indice
                        combiné est la moyenne simple des groupes qui ont un score. Un
                        groupe sans donnée n’est ni compté à 0 ni ramené à 50.
                      </p>
                    </div>
                  </details>
                  <button
                    type="button"
                    onClick={refresh}
                    className="text-ink-500 hover:text-ink-100 mt-2 text-xs underline pointer-coarse:min-h-11"
                  >
                    Recalculer pour la zone visible
                  </button>
                </>
              )}
            </div>
          </div>
        )}
    </>
  )
}
