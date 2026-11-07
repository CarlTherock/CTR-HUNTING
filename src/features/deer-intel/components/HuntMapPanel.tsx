import { useState } from 'react'
import { useInRouterContext, useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { formatLatitude, formatLongitude } from '@/utils/coordinateFormat'
import { useHuntStore } from '../state/huntStore'
import { HUNT_ROUTE } from './HuntControl'

const GRADE: Record<string, string> = { A: 'Rang A', B: 'Rang B', C: 'Rang C' }

/**
 * Sur la carte : légende repliable de la couche « Où chasser » et fiche courte du point touché.
 * Aucun horaire n'est associé à un point : le calcul spatial et le calcul temporel ne sont pas liés.
 */
export function HuntMapPanel() {
  const inRouter = useInRouterContext()
  const spatial = useHuntStore((s) => s.result?.record.spatial ?? null)
  const visible = useHuntStore((s) => s.mapVisible)
  const origin = useHuntStore((s) => s.result?.origin ?? null)
  const selectedId = useHuntStore((s) => s.selectedCandidateId)
  const select = useHuntStore((s) => s.selectCandidate)
  const startDraftAt = useWaypointsStore((s) => s.startDraftAt)
  const [legendOpen, setLegendOpen] = useState(false)
  const landNote = useHuntStore(
    (s) =>
      s.result?.notes.find((n) => n.startsWith('Occupation du sol indisponible')) ?? null,
  )
  const hasResult = useHuntStore((s) => s.result !== null)
  const retry = useHuntStore((s) => s.run)
  if (hasResult && !spatial && visible && landNote)
    return (
      <div
        role="status"
        data-testid="hunt-map-missing"
        className="border-surface-600 bg-surface-900/95 text-ink-200 absolute bottom-20 left-3 z-10 max-w-[80vw] rounded-lg border p-3 text-xs shadow-lg"
      >
        <p className="text-ink-100 text-sm font-semibold">
          Où chasser : aucun secteur à afficher
        </p>
        <p className="mt-1">{landNote}</p>
        <p className="text-ink-400 mt-1">
          Rien n’est dessiné à la place des données absentes.
        </p>
        <button
          type="button"
          onClick={() => void retry()}
          className="bg-brand-500 text-surface-950 mt-2 min-h-11 w-full rounded-md px-3 text-sm font-semibold"
        >
          Réessayer
        </button>
      </div>
    )
  if (!spatial || !visible) return null
  const cand = spatial.candidates.find((c) => c.id === selectedId) ?? null
  const corridors = spatial.corridors.computed ? spatial.corridors.corridors.length : 0

  return (
    <>
      <div className="absolute bottom-20 left-3 z-10 max-w-[70vw]">
        <button
          type="button"
          aria-expanded={legendOpen}
          onClick={() => setLegendOpen((o) => !o)}
          className="border-surface-600 bg-surface-900/90 text-ink-100 min-h-11 rounded-lg border px-3 text-sm font-medium shadow-lg"
        >
          Où chasser · légende
        </button>
        {legendOpen && (
          <ul className="border-surface-600 bg-surface-900/95 text-ink-200 mt-1 space-y-1 rounded-lg border p-3 text-xs shadow-lg">
            <li>
              <span className="mr-1 inline-block size-3 rounded-full bg-[#16a34a]" />{' '}
              Point A (≥ 75) ·{' '}
              <span className="mr-1 inline-block size-2.5 rounded-full bg-[#ca8a04]" />B
              (≥ 60) ·{' '}
              <span className="mr-1 inline-block size-2 rounded-full bg-[#64748b]" />C (≥
              50)
            </li>
            <li>
              <span className="mr-1 inline-block h-2 w-4 bg-[#22c55e]/50" /> Secteur
              d’habitat (score ≥ 60)
            </li>
            <li>
              <span className="mr-1 inline-block w-4 border-t-2 border-dashed border-[#f0abfc]" />{' '}
              Corridor potentiel ({corridors} calculé(s)) — pas une piste observée
            </li>
            <li>
              <span className="mr-1 inline-block w-4 border-t border-dashed border-slate-200" />{' '}
              Emprise analysée
            </li>
            <li className="text-ink-400">
              Indice comparatif, pas une garantie de présence.
            </li>
          </ul>
        )}
      </div>

      {cand && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div
            data-testid="hunt-point-sheet"
            className="border-surface-600 bg-surface-900 w-full max-w-sm rounded-lg border p-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-ink-100 text-base font-semibold">
                  Point {cand.id} · {GRADE[cand.grade] ?? cand.grade}
                </h2>
                <p className="text-ink-400 text-xs tabular-nums">
                  {formatLatitude(cand.coordinate.lat)}{' '}
                  {formatLongitude(cand.coordinate.lng)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => select(null)}
                aria-label="Fermer la fiche du point"
                className="text-ink-500 flex size-11 items-center justify-center"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <p className="text-ink-100 mt-1 text-sm">Pourquoi ici</p>
            <ul className="text-ink-300 mt-1 list-disc pl-5 text-sm">
              {cand.reasons.slice(0, 3).map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <p className="text-ink-400 mt-2 text-xs">
              Créneau associé : aucun — les secteurs et les heures sont calculés
              séparément.
            </p>
            <p className="text-ink-400 mt-1 text-xs">
              Données :{' '}
              {origin === 'enregistree' ? 'analyse enregistrée' : 'calculées maintenant'}
              {cand.missing.length > 0
                ? ` · non intégré : ${cand.missing.join(', ')}`
                : ''}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  startDraftAt(cand.coordinate, `Point candidat ${cand.id}`)
                  select(null)
                }}
                className="bg-brand-500 text-surface-950 min-h-11 flex-1 rounded-md px-3 text-sm font-semibold"
              >
                Enregistrer comme repère
              </button>
              {inRouter && <DashboardLink />}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function DashboardLink() {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => navigate(HUNT_ROUTE)}
      className="border-surface-600 text-ink-200 min-h-11 rounded-md border px-3 text-sm"
    >
      Dashboard
    </button>
  )
}
