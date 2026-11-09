import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Clock, Settings2 } from 'lucide-react'
import { Card } from '@/components/ui'
import type { HuntResult } from '../state/huntStore'
import { useHuntPresentationStore } from '../state/presentationStore'
import { HourlyChart } from './HourlyChart'
import { ConditionsPanel } from './ConditionsPanel'
import { DayComparison } from './DayComparison'
import { RecommendationCard } from './RecommendationCard'
import { SpatialSummary } from './SpatialSummary'
import { TerrainOverview } from './TerrainOverview'
import { HowTab } from './HowTab'
import { SourcesPanel } from './SourcesPanel'
import { PressurePanel } from './PressurePanel'
import { TemperaturePanel } from './TemperaturePanel'
import { WhenDetails } from './WhenDetails'
import { WhereTab } from './WhereTab'
import { durationLabel, pickBestSlot, reasonsFor, weatherDrivesRanking } from './dashboard'
import { ROBUSTNESS_TEXT, dayLabel, windowLabel } from './format'

function Fold({ title, children }: { title: string; children: ReactNode }) {
  return <details className="border-surface-700 bg-surface-900 rounded-2xl border"><summary className="text-ink-100 min-h-12 cursor-pointer px-4 py-3 text-sm font-semibold">{title}</summary><div className="border-surface-700 border-t p-4">{children}</div></details>
}

export function Dashboard({ result, onOpenParams }: { result: HuntResult; onOpenParams: () => void }) {
  const record = result.record, hunt = record.hunt
  const dateKey = useHuntPresentationStore((s) => s.dateKey)
  const setDateKey = useHuntPresentationStore((s) => s.setDateKey)
  const selected = Math.max(0, hunt.days.findIndex((d) => d.dateKey === dateKey))
  const select = (i: number) => { const d = hunt.days[i]; if (d) setDateKey(d.dateKey) }
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(t) }, [])
  const day = hunt.days[selected]
  if (!day) return null
  const best = pickBestSlot(day, now), tz = record.timezone
  const fetched = record.data.forecastFetchedAt
  const fresh = result.origin === 'enregistree'
    ? `Analyse enregistrée le ${record.savedAt.slice(0, 16).replace('T', ' ')} UTC — pas une nouvelle prévision`
    : fetched ? `Prévision reçue à ${new Intl.DateTimeFormat('fr-CA', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(fetched))}` : 'Sans prévision météo : référence astronomique seulement'
  return <div className="flex min-w-0 flex-col gap-5">
    <header className="border-surface-700 bg-surface-950 flex items-start justify-between gap-3 rounded-3xl border p-5"><div className="min-w-0"><p className="text-brand-300 text-xs font-semibold tracking-widest uppercase">Où · Quand · Pourquoi</p><h1 className="text-ink-100 mt-2 break-words text-2xl font-semibold sm:text-3xl">{record.label}</h1><p className="text-ink-300 mt-3 text-sm">{dayLabel(day.dateKey)} · {tz}</p><p className="text-ink-400 mt-1 text-xs">{fresh}</p></div><button type="button" onClick={onOpenParams} aria-label="Paramètres : lieu, date et emprise" className="border-surface-600 text-ink-200 flex size-11 shrink-0 items-center justify-center rounded-xl border"><Settings2 size={18} aria-hidden="true"/></button></header>
    {result.notes.length > 0 && <section aria-label="État des données" data-testid="hunt-data-notes" className="border-surface-700 bg-surface-900 rounded-2xl border p-4"><h2 className="text-status-warning text-sm font-semibold">État des données · {result.notes.length} information(s)</h2><div className="mt-2 space-y-2">{result.notes.map((n) => <p key={n} className="text-status-warning break-words text-sm">{n}</p>)}</div></section>}
    {!record.spatial && <SpatialSummary spatial={null}/>}
    <TerrainOverview spatial={record.spatial}/>
    <section aria-label="Quand chasser" className="grid min-w-0 gap-4 lg:grid-cols-2">
      <Card className="border-brand-500/40 bg-gradient-to-br from-emerald-950/40 to-slate-900 min-w-0 rounded-3xl p-5"><h2 className="text-brand-300 flex items-center gap-2 text-sm font-semibold"><Clock size={16} aria-hidden="true"/>Meilleur créneau estimé</h2>
        {best ? <><p className="text-ink-100 mt-3 break-words text-3xl font-bold tabular-nums sm:text-4xl">{windowLabel(best.main)}</p><p className="text-ink-300 mt-2 text-sm">{durationLabel(best.main)}{Date.parse(best.main.endIso) <= now ? ' · déjà passé' : best.status === 'en_cours' ? ' · en cours' : ' · à venir'}</p>{best.earlierBest && <p className="text-ink-400 mt-2 text-xs">Le meilleur créneau du jour ({windowLabel(best.earlierBest)}) est passé ; celui-ci est le meilleur restant.</p>}<ul className="text-ink-200 mt-4 list-disc space-y-2 pl-5 text-sm">{reasonsFor(day, best.main, tz).map((r) => <li key={r}>{r}</li>)}</ul>{best.alternative && <p className="text-ink-300 mt-3 text-sm">Alternative : {windowLabel(best.alternative)}</p>}{(day.robustness === 'equivalent' || day.robustness === 'fragile') && <p className="text-status-warning mt-2 text-xs">{ROBUSTNESS_TEXT[day.robustness]}</p>}</> : <p className="text-ink-300 mt-3 text-sm">Aucun créneau défendable avec les données et les critères actuels.</p>}
        <p className="text-ink-400 mt-4 text-xs">Estimation comparative — pas une garantie de présence.{!weatherDrivesRanking(day) && ' La météo ne modifie pas ce classement : aucune donnée évaluée.'}</p>
      </Card>
      <div className="min-w-0"><RecommendationCard record={record} dayIndex={selected}/></div>
    </section>
    {hunt.days.length > 1 && <Fold title="Comparer les journées"><DayComparison days={hunt.days} selected={selected} onSelect={select}/><p className="text-ink-400 mt-2 text-xs">Même échelle 0–100, mais pas de classement entre journées dont les facteurs évalués diffèrent. Aucun pourcentage de réussite.</p></Fold>}
    <Card className="min-w-0 rounded-2xl p-4"><HourlyChart key={`${record.id}:${day.dateKey}`} day={day} timeZone={tz}/></Card>
    <ConditionsPanel day={day} timeZone={tz}/>
    <Link to="/rut" className="border-surface-700 bg-surface-900 text-sky-300 flex min-h-12 items-center rounded-2xl border px-4 text-sm">Calendrier du rut · repères et conseils documentés</Link>
    <Fold title="Secteurs, points et corridors"><WhereTab spatial={record.spatial}/></Fold>
    {record.spatial && <Fold title="Qualité et provenance des données cartographiques"><SpatialSummary spatial={record.spatial}/></Fold>}
    <Fold title="Pourquoi ce créneau ? Détails et calendrier"><WhenDetails hunt={hunt} day={day} selected={selected} onSelect={select}/></Fold>
    <Fold title="Température et pression (contexte)"><div className="space-y-3"><TemperaturePanel day={day}/><PressurePanel day={day}/></div></Fold>
    <Fold title="Formule, méthodologie et limites"><HowTab hunt={hunt} spatial={record.spatial}/></Fold>
    <Fold title="Sources, règles et bibliographie"><SourcesPanel record={record}/></Fold>
    <p className="text-ink-500 text-xs">Moteur {hunt.engineVersion} · registre {hunt.registryVersion} · analyse autonome, journal facultatif.</p>
  </div>
}
