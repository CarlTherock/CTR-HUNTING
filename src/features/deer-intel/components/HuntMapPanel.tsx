import { useEffect, useState } from 'react'
import { useInRouterContext, useNavigate } from 'react-router-dom'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { formatLatitude, formatLongitude } from '@/utils/coordinateFormat'
import { useHuntStore } from '../state/huntStore'
import { useHuntPresentationStore, type HuntLayerKey } from '../state/presentationStore'
import { pickBestSlot } from './dashboard'
import { dayLabel, windowLabel } from './format'
import { HUNT_ROUTE } from './HuntControl'

const layerLabels: Record<HuntLayerKey, string> = {
  sectors: 'Secteurs d’habitat · vert', candidates: 'Points candidats · A / B / C',
  corridors: 'Corridors potentiels · pointillés roses', extent: 'Emprise analysée · contour clair',
}
export function HuntMapPanel() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const inRouter = useInRouterContext()
  const result = useHuntStore((s) => s.result)
  const visible = useHuntStore((s) => s.mapVisible)
  const selectedId = useHuntStore((s) => s.selectedCandidateId)
  const select = useHuntStore((s) => s.selectCandidate)
  const opacity = useHuntStore((s) => s.sectorOpacity)
  const setOpacity = useHuntStore((s) => s.setSectorOpacity)
  const retry = useHuntStore((s) => s.run)
  const startDraftAt = useWaypointsStore((s) => s.startDraftAt)
  const layers = useHuntPresentationStore((s) => s.layers)
  const setLayer = useHuntPresentationStore((s) => s.setLayer)
  const dateKey = useHuntPresentationStore((s) => s.dateKey)
  if (!result || !visible) return null
  const spatial = result.record.spatial
  if (!spatial) return <div role="status" data-testid="hunt-map-missing" className="border-surface-600 bg-surface-900/95 text-ink-200 absolute bottom-20 left-3 z-10 max-w-[85vw] rounded-xl border p-3 text-sm"><p>Où chasser : aucun secteur à afficher</p><p className="mt-1 text-xs">{result.notes.find((n) => n.startsWith('Occupation du sol indisponible')) ?? 'Aucune donnée spatiale exploitable. Rien n’est dessiné à sa place.'}</p><button type="button" onClick={() => void retry()} className="text-brand-300 mt-2 min-h-11 px-3">Réessayer</button></div>
  const cand = spatial.candidates.find((c) => c.id === selectedId) ?? null
  const days = result.record.hunt.days
  const day = days.find((d) => d.dateKey === dateKey) ?? days[0]
  const best = day ? pickBestSlot(day, now) : null
  return <>
    {!cand && <details className="border-surface-600 bg-surface-900/95 text-ink-200 absolute bottom-20 left-3 z-10 max-w-[85vw] rounded-xl border shadow-lg"><summary className="min-h-11 cursor-pointer px-3 py-3 text-sm font-semibold">Couches d’analyse · légende</summary><div className="max-h-[45vh] space-y-2 overflow-y-auto px-3 pb-3">{(Object.keys(layerLabels) as HuntLayerKey[]).map((key) => <label key={key} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={layers[key]} onChange={(e) => setLayer(key, e.target.checked)}/>{layerLabels[key]}</label>)}<label className="block text-xs">Opacité des secteurs : {Math.round(opacity * 100)} %<input type="range" min={10} max={90} value={Math.round(opacity * 100)} onChange={(e) => setOpacity(Number(e.target.value) / 100)} className="mt-1 min-h-11 w-full"/></label><p className="max-w-xs text-xs">A ≥ 75 · B ≥ 60 · C ≥ 50. Indices d’habitat, pas des probabilités. Les corridors sont des hypothèses, pas des pistes observées. Autres couches forestières et météo : outils de la carte.</p></div></details>}
    {cand && <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"><section data-testid="hunt-point-sheet" aria-label={`Point ${cand.id}`} className="border-surface-600 bg-surface-900 max-h-[55vh] w-full max-w-md overflow-y-auto rounded-2xl border p-4 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h2 className="text-ink-100 text-lg font-semibold">Point {cand.id} · rang {cand.grade}</h2><p className="text-ink-400 text-xs">{formatLatitude(cand.coordinate.lat)} {formatLongitude(cand.coordinate.lng)}</p></div><button type="button" aria-label="Fermer la fiche du point" onClick={() => select(null)} className="text-ink-200 min-h-11 px-3">Fermer</button></div><h3 className="text-ink-100 mt-3 text-sm font-semibold">Pourquoi ici</h3><ul className="text-ink-300 mt-1 list-disc space-y-1 pl-5 text-sm">{cand.reasons.map((r) => <li key={r}>{r}</li>)}</ul><p className="text-brand-300 mt-3 text-sm">{day ? `${dayLabel(day.dateKey)} : ` : ''}{best ? windowLabel(best.main) : 'aucun créneau défendable'}</p><p className="text-ink-400 mt-1 text-xs">Horaire de l’emprise analysée, pas un horaire calculé pour ce point. Le classement spatial reste indépendant du classement des heures.</p><p className="text-ink-400 mt-2 text-xs">{result.origin === 'enregistree' ? 'Analyse enregistrée' : 'Analyse calculée maintenant'}{cand.missing.length > 0 ? ` · non intégré : ${cand.missing.join(', ')}` : ''}. Accès et autorisation à vérifier séparément.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => { startDraftAt(cand.coordinate, `Point candidat ${cand.id}`); select(null) }} className="bg-brand-500 text-surface-950 min-h-11 flex-1 rounded-lg px-3 text-sm font-semibold">Enregistrer comme repère</button>{inRouter && <DashboardLink/>}</div></section></div>}
  </>
}
function DashboardLink() {
  const navigate = useNavigate()
  return <button type="button" onClick={() => navigate(HUNT_ROUTE)} className="border-surface-600 text-ink-200 min-h-11 rounded-lg border px-3 text-sm">Dashboard</button>
}
