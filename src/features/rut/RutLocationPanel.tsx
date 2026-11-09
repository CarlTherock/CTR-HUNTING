import { useNavigate } from 'react-router-dom'
import { useHuntStore } from '@/features/deer-intel/state/huntStore'
import { classifyTerritory } from './territory'
import { summarizeObservations } from './observationsSummary'
import { recommend } from './recommendation'
import { localPlan } from './localPlan'

const source = 'https://www.quebec.ca/agriculture-environnement-et-ressources-naturelles/faune/animaux-sauvages-quebec/fiches-especes-fauniques/cerf-virginie'
const shortDate = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`

export function RutLocationPanel({ dateKey }: { dateKey: string }) {
  const navigate = useNavigate()
  const result = useHuntStore((s) => s.result)
  const inputs = useHuntStore((s) => s.inputs)
  const startPicking = useHuntStore((s) => s.startPicking)
  const setInputs = useHuntStore((s) => s.setInputs)
  const run = useHuntStore((s) => s.run)
  const status = useHuntStore((s) => s.status)
  const error = useHuntStore((s) => s.error)
  const requestFocus = useHuntStore((s) => s.requestMapFocus)
  const selectCandidate = useHuntStore((s) => s.selectCandidate)
  const record = result?.record
  const coordinate = inputs.coordinate ?? record?.hunt.params.coordinate
  const choose = () => { startPicking(); navigate('/map') }
  if (!coordinate) return <section className="border-surface-700 bg-surface-900 rounded-2xl border p-5"><h2 className="text-xl font-semibold">Planifier ce territoire</h2><p className="text-ink-300 mt-2 text-sm">Choisissez un lieu pour réunir les conditions, les secteurs et les corridors.</p><button type="button" onClick={choose} className="bg-brand-500 text-surface-950 mt-4 min-h-11 rounded-xl px-4 font-semibold">Choisir sur la carte</button></section>
  const territory = classifyTerritory(coordinate.lat, coordinate.lng).state
  const same = record?.hunt.params.coordinate.lat === coordinate.lat && record?.hunt.params.coordinate.lng === coordinate.lng
  const days = same && record ? record.hunt.days.filter((d) => d.weatherCoverage !== 'aucune').map((day) => {
    const rec = recommend({ day, timeZone: record.timezone, territory, summary: summarizeObservations([], [], { timeZone: record.timezone }), hasPostInfo: record.hunt.params.favorableWindFrom.length > 0 || record.hunt.params.sensitiveBearings.length > 0 })
    return { dateKey: day.dateKey, best: [...rec.windows].sort((a, b) => b.coreIndex - a.coreIndex)[0] ?? null }
  }) : []
  const plan = localPlan(dateKey, territory, days)
  const spatial = same && record?.spatial && record.spatial.extent.center.lat === coordinate.lat && record.spatial.extent.center.lng === coordinate.lng ? record.spatial : null
  const corridors = spatial?.corridors.computed ? spatial.corridors.corridors : []
  const openMap = (id: string | null) => { requestFocus(); selectCandidate(id); navigate('/map') }
  const explanation = plan.state === 'departage' ? `Le ${shortDate(plan.bestDate!)} ressort selon les conditions disponibles.` : plan.state === 'equivalents' ? 'Les meilleurs jours sont équivalents : aucun gagnant artificiel.' : plan.state === 'non_comparables' ? 'Couverture des facteurs différente : aucun classement entre ces journées.' : 'Il faut au moins deux jours avec des créneaux et des facteurs comparables.'
  return <section data-testid="rut-location-plan" data-lat={coordinate.lat} data-lng={coordinate.lng} className="border-surface-700 bg-surface-950 text-ink-100 overflow-hidden rounded-3xl border shadow-xl">
    <header className="border-surface-700 bg-surface-900 border-b p-5"><p className="text-brand-300 text-xs font-semibold tracking-widest uppercase">Québec · plan de terrain</p><h2 className="mt-2 text-2xl font-semibold">Un lieu. Une lecture d’ensemble.</h2><p className="text-ink-300 mt-2 text-sm tabular-nums">{coordinate.lat.toFixed(5)}, {coordinate.lng.toFixed(5)}</p><button type="button" onClick={choose} className="text-sky-300 mt-2 min-h-11 text-sm underline">Changer le lieu</button></header>
    <div className="space-y-5 p-5">
      <div className="grid gap-3 sm:grid-cols-2"><div className="border-surface-700 bg-surface-900 rounded-2xl border p-4"><p className="text-ink-400 text-xs uppercase">Contexte biologique</p><p className="mt-2 text-lg font-semibold">{plan.supported ? 'Novembre et décembre' : 'Territoire non couvert'}</p><p className="text-ink-300 mt-2 text-xs">{plan.supported ? 'Reproduction principalement durant ces mois. Aucun pic local calculé.' : 'Le contexte du Québec continental n’est pas extrapolé à ce point.'}</p></div><div className="border-surface-700 bg-surface-900 rounded-2xl border p-4"><p className="text-ink-400 text-xs uppercase">Période à comparer</p><p className="mt-2 text-lg font-semibold tabular-nums">{shortDate(plan.startKey)} — {shortDate(plan.endKey)}</p><p className="text-ink-300 mt-2 text-xs">Sept jours à partir de la date choisie, pas une semaine de rut imposée.</p></div></div>
      {plan.supported && <div><h3 className="text-lg font-semibold">Quand privilégier une sortie</h3><p className="text-ink-300 mt-2 text-sm">{explanation}</p>{plan.state !== 'non_comparables' && plan.eligible.length > 0 && <figure className="border-surface-700 bg-surface-900 mt-3 rounded-2xl border p-4"><div className="text-ink-400 mb-3 flex justify-between text-xs"><span>Indice pratique · meilleur noyau de 60 min</span><span>0 — 100</span></div><ul className="space-y-3">{plan.eligible.map((d) => <li key={d.dateKey}><div className="mb-1 flex justify-between gap-2 text-sm tabular-nums"><span>{shortDate(d.dateKey)}</span><span>{Math.round(d.best!.coreIndex)}/100 · {d.best!.startClock}–{d.best!.endClock}</span></div><div className="bg-surface-700 h-2 overflow-hidden rounded-full"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${d.best!.coreIndex}%` }}/></div></li>)}</ul><figcaption className="text-ink-400 mt-4 text-xs">Indice du modèle, pas une probabilité de présence ni une courbe biologique. Même durée de comparaison, mêmes facteurs évalués. Les horaires affichés couvrent le créneau entier.</figcaption></figure>}<button type="button" disabled={status === 'loading'} onClick={() => { setInputs({ coordinate, startDateKey: dateKey, days: 7 }); void run() }} className="bg-brand-500 text-surface-950 mt-4 min-h-11 w-full rounded-xl px-4 font-semibold disabled:opacity-60">{status === 'loading' ? 'Analyse en cours…' : 'Analyser ces sept jours et ce territoire'}</button>{status === 'error' && error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}</div>}
      <div className="border-surface-700 border-t pt-5"><h3 className="text-lg font-semibold">Où prospecter</h3>{spatial ? <><p className="text-ink-300 mt-2 text-sm">{spatial.sectors.length} secteurs · {spatial.candidates.length} points candidats · {corridors.length} corridors potentiels</p><p className="text-ink-400 mt-1 text-xs">Couverture cartographique : {Math.round(spatial.coverage * 100)} %. Une donnée absente n’est pas un habitat défavorable.</p><ul className="mt-3 space-y-2">{spatial.candidates.slice(0, 3).map((candidate) => <li key={candidate.id}><button type="button" onClick={() => openMap(candidate.id)} className="border-surface-700 bg-surface-900 w-full rounded-2xl border p-4 text-left"><span className="flex justify-between gap-3 font-semibold"><span>{candidate.id} · rang {candidate.grade}</span><span className="text-brand-300 tabular-nums">{candidate.score}/100</span></span><span className="text-ink-300 mt-2 block text-sm">{candidate.reasons.slice(0, 2).join(' · ') || 'Consulter les limites de ce point sur la carte.'}</span><span className="text-sky-300 mt-2 block text-xs">Ouvrir la fiche sur la carte</span></button></li>)}</ul><p className="text-ink-400 mt-3 text-xs">{corridors.filter((c) => c.kind === 'principal' && c.robustness === 'robuste').length} corridors principaux stables entre les scénarios testés. Stabilité du calcul ≠ passage observé. Relief, accès, autorisations et vent au poste restent à vérifier.</p><button type="button" onClick={() => openMap(null)} className="border-surface-600 mt-3 min-h-11 w-full rounded-xl border px-4 text-sm">Explorer les secteurs et corridors</button></> : <p className="text-ink-300 mt-2 text-sm">Aucune analyse spatiale correspondant à ce point. Les secteurs d’un autre lieu ne sont pas réutilisés ici.</p>}</div>
      <footer className="border-surface-700 text-ink-400 border-t pt-4 text-xs"><p>Le lieu sert aux conditions et à l’analyse spatiale ; il ne décale pas artificiellement le rut. Les classements spatial et horaire restent distincts. Vérifiez les périodes et engins légalement permis.</p><a href={source} target="_blank" rel="noreferrer" className="text-sky-300 mt-2 inline-flex min-h-11 items-center underline">Référence biologique : Gouvernement du Québec</a></footer>
    </div>
  </section>
}
