import { ListChecks, MapPinPlus, X } from 'lucide-react'
import { OpenAssistantButton } from '@/features/ai/components/OpenAssistantButton'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { FAMILY_ORDER } from '@/utils/analysisFamilies'
import { cellSizeMeters, formatCellMeters } from '@/utils/grid'
import { haversineMeters } from '@/utils/geo'
import { compassLabel } from '@/utils/terrain'
import { useHeatmapStore } from '../state/heatmapStore'
import { CellDifferencePanel, SlotComparisonPanel } from './CellComparison'
import { HourSelect } from './HourSelect'
import { PANEL_BOX, PANEL_WRAPPER } from './panelLayout'
import { CoverageLine, FamilySection } from './AnalyzerBreakdown'
import { formatDataTime, scoreLabel } from './analyzerFormat'
import type { Coordinate } from '@/types'

function bearingDegrees(from: Coordinate, to: Coordinate): number {
  const rad = Math.PI / 180
  const dLng = (to.lng - from.lng) * rad
  const y = Math.sin(dLng) * Math.cos(to.lat * rad)
  const x =
    Math.cos(from.lat * rad) * Math.sin(to.lat * rad) -
    Math.sin(from.lat * rad) * Math.cos(to.lat * rad) * Math.cos(dLng)
  return (((Math.atan2(y, x) / rad) % 360) + 360) % 360
}

/**
 * Fiche d'une cellule de la carte de potentiel : famille par famille, les
 * facteurs, leur contribution, leur source, leur date/heure, leur
 * résolution et leurs limites, ce qui manque, et la couverture. Panneau
 * bas à défilement INTERNE (en-tête collant), marges de zone sûre, boutons
 * d'au moins 44 px au toucher : utilisable en portrait comme en paysage.
 */
export function HeatmapCellSheet() {
  const index = useHeatmapStore((s) => s.selectedCellIndex)
  const cells = useHeatmapStore((s) => s.cells)
  const statics = useHeatmapStore((s) => s.statics)
  const hour = useHeatmapStore((s) => s.hour)
  const hourOptions = useHeatmapStore((s) => s.hourOptions)
  const computedAt = useHeatmapStore((s) => s.computedAt)
  const computedBounds = useHeatmapStore((s) => s.computedBounds)
  const gridSize = useHeatmapStore((s) => s.gridSize)
  const windField = useHeatmapStore((s) => s.windField)
  const weather = useHeatmapStore((s) => s.weather)
  const previousIndex = useHeatmapStore((s) => s.previousCellIndex)
  const compareHourKey = useHeatmapStore((s) => s.compareHourKey)
  const selectCell = useHeatmapStore((s) => s.selectCell)
  const setCompareHour = useHeatmapStore((s) => s.setCompareHour)
  const startDraftAt = useWaypointsStore((s) => s.startDraftAt)

  if (index === null || !computedBounds) return null
  const cell = cells[index]
  const cellStatics = statics[index]
  if (!cell || !cellStatics) return null

  const size = cellSizeMeters(computedBounds, gridSize)
  const combined = cell.combined
  const previous = previousIndex !== null ? cells[previousIndex] : undefined
  const where = previous
    ? `${formatCellMeters(haversineMeters(cell.coordinate, previous.coordinate))} vers le ${compassLabel(
        bearingDegrees(cell.coordinate, previous.coordinate),
      )}`
    : ''

  function saveAsWaypoint() {
    // Parcours EXISTANT : un brouillon que l'on peut ajuster, puis
    // « Enregistrer » verrouille la position. Rien n'est écrit ici.
    startDraftAt(cell.coordinate, 'Cellule d’analyse')
    selectCell(null)
  }

  return (
    <div className={PANEL_WRAPPER}>
      <section
        aria-label="Fiche de la cellule"
        data-testid="heatmap-cell-sheet"
        className={`${PANEL_BOX} bg-surface-900`}
      >
        <div className="border-surface-700 bg-surface-900 sticky top-0 z-10 flex items-center justify-between gap-2 border-b px-3 py-2">
          <h2 className="text-ink-100 text-sm font-semibold">Cellule d’analyse</h2>
          <button
            type="button"
            onClick={() => selectCell(null)}
            aria-label="Fermer la fiche de la cellule"
            className="text-ink-500 hover:text-ink-100 flex size-8 items-center justify-center pointer-coarse:size-11"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-3">
          <div>
            <p className="text-ink-500 text-xs">
              ≈ {formatCellMeters(size.widthMeters)} ×{' '}
              {formatCellMeters(size.heightMeters)} · centre{' '}
              {cell.coordinate.lat.toFixed(4)}, {cell.coordinate.lng.toFixed(4)}
            </p>
            {combined.overallScore !== null ? (
              <p className="text-ink-100 mt-1 text-base font-semibold">
                Indice de repère {Math.round(combined.overallScore)}/100
                <span className="text-ink-300 text-xs font-normal">
                  {' '}
                  · {scoreLabel(combined.overallScore)}
                </span>
              </p>
            ) : (
              <p className="text-ink-300 mt-1 text-sm font-medium">
                Aucun indice : aucune donnée exploitable dans cette cellule.
              </p>
            )}
            <p className="text-ink-500 text-xs">
              Repère comparatif entre cellules — pas une probabilité de présence, de
              déplacement ni de récolte. Analyse environnementale générale (aucun profil
              d’espèce).
            </p>
            {combined.coverage && (
              <div className="mt-1">
                <CoverageLine coverage={combined.coverage} />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <HourSelect id="sheet-hour" />
            <p className="text-ink-500 text-[11px]">
              Facteurs météo et vent :{' '}
              <span className="text-ink-300">{hour?.timeLabel ?? 'actuel'}</span>
              {computedAt && <> · requêtes faites à {formatDataTime(computedAt)}</>}
            </p>
          </div>

          {FAMILY_ORDER.map((family) => (
            <FamilySection
              key={family}
              family={family}
              summary={combined.families?.find((f) => f.family === family)}
              results={combined.results}
            />
          ))}

          <CellDifferencePanel
            current={combined}
            previous={previous?.combined ?? null}
            where={where}
          />

          <SlotComparisonPanel
            statics={cellStatics}
            windField={windField}
            weather={weather}
            hourOptions={hourOptions}
            compareHourKey={compareHourKey}
            sampleSpacingMeters={(size.widthMeters + size.heightMeters) / 2}
            onChange={setCompareHour}
          />

          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={saveAsWaypoint}
              className="bg-brand-500 text-surface-950 hover:bg-brand-400 flex min-h-11 w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold"
            >
              <MapPinPlus size={16} aria-hidden="true" />
              Enregistrer cette cellule comme waypoint
            </button>
            <p className="text-ink-500 text-[11px]">
              Crée un brouillon au centre de la cellule : vous pouvez ajuster sa position,
              puis « Enregistrer » la verrouille.
            </p>
          </div>

          <OpenAssistantButton tool="explain" testId="explain-cell">
            <ListChecks size={16} aria-hidden="true" />
            Expliquer cette cellule
          </OpenAssistantButton>

          <p className="text-ink-600 text-[11px]">
            Aucune donnée structurée « animal observé » n’existe dans l’application : les
            entrées du journal sont du texte libre, comptées à titre d’information et
            jamais interprétées. Un secteur souvent visité (traces) n’augmente pas
            l’indice d’habitat : c’est un biais d’effort d’observation.
          </p>
        </div>
      </section>
    </div>
  )
}
