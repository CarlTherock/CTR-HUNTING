import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, MapPin, Settings2, Sun } from 'lucide-react'
import { Badge, Button, Card } from '@/components/ui'
import type { SavedHuntAnalysis } from '@/types'
import { formatLatitude, formatLongitude } from '@/utils/coordinateFormat'
import { useHuntStore, type HuntResult } from '../state/huntStore'
import { HourlyChart } from './HourlyChart'
import { HowTab } from './HowTab'
import { SourcesPanel } from './SourcesPanel'
import { PressurePanel } from './PressurePanel'
import { TemperaturePanel } from './TemperaturePanel'
import { WhenDetails } from './WhenDetails'
import { WhereTab } from './WhereTab'
import {
  durationLabel,
  pickBestSlot,
  reasonsFor,
  weatherBrief,
  weatherDrivesRanking,
} from './dashboard'
import { ROBUSTNESS_TEXT, dayLabel, windowLabel } from './format'

const num = (v: number | null, unit: string, digits = 0) =>
  v === null ? '—' : `${v.toFixed(digits)} ${unit}`

function Fold({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="border-surface-700 bg-surface-900 rounded-lg border">
      <summary className="text-ink-100 min-h-12 cursor-pointer px-3 py-3 text-sm font-semibold">
        {title}
      </summary>
      <div className="border-surface-700 border-t p-3">{children}</div>
    </details>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-surface-800 min-w-0 rounded-md px-2 py-2 text-center">
      <p className="text-ink-500 text-[11px]">{label}</p>
      <p className="text-ink-100 text-base font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-ink-400 text-[11px]">{sub}</p>}
    </div>
  )
}

function freshness(record: SavedHuntAnalysis, origin: HuntResult['origin']): string {
  const f = record.data.forecastFetchedAt
  if (origin === 'enregistree')
    return `Analyse enregistrée le ${record.savedAt.slice(0, 16).replace('T', ' ')} UTC (relue sans réseau)`
  return f
    ? `Prévision reçue à ${new Intl.DateTimeFormat('fr-CA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: record.timezone }).format(new Date(f))}`
    : 'Aucune prévision météo : activité de référence seulement'
}

/** Premier écran : quand, où et pourquoi, sans formulaire ni tableau de scores. */
export function Dashboard({
  result,
  onOpenParams,
}: {
  result: HuntResult
  onOpenParams: () => void
}) {
  const navigate = useNavigate()
  const requestFocus = useHuntStore((s) => s.requestMapFocus)
  const record = result.record
  const hunt = record.hunt
  const [selected, setSelected] = useState(0)
  // Heure courante, rafraîchie chaque minute : « restant » et « passé » restent justes.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(t)
  }, [])
  const day = hunt.days[Math.min(selected, hunt.days.length - 1)]
  if (!day) return null
  const best = pickBestSlot(day, now)
  const tz = hunt.params.timezone
  const brief = best ? weatherBrief(day, best.main) : null
  const reasons = best ? reasonsFor(day, best.main, tz) : []
  const spatial = record.spatial
  const top = spatial?.candidates[0] ?? null

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-ink-100 truncate text-base font-semibold">
            {record.label}
          </h1>
          <p className="text-ink-400 text-xs">
            {dayLabel(day.dateKey)} · {tz}
          </p>
          <p className="text-ink-500 text-xs">{freshness(record, result.origin)}</p>
        </div>
        <button
          type="button"
          onClick={onOpenParams}
          aria-label="Paramètres : lieu, date et emprise"
          className="border-surface-600 text-ink-300 flex size-11 shrink-0 items-center justify-center rounded-lg border"
        >
          <Settings2 size={18} aria-hidden="true" />
        </button>
      </header>

      {result.notes.map((n) => (
        <p key={n} className="text-status-warning text-sm">
          {n}
        </p>
      ))}

      {hunt.days.length > 1 && (
        <div role="group" aria-label="Jour" className="flex gap-1.5 overflow-x-auto">
          {hunt.days.map((d, i) => (
            <button
              key={d.dateKey}
              type="button"
              aria-pressed={i === selected}
              onClick={() => setSelected(i)}
              className={
                i === selected
                  ? 'border-brand-500 bg-brand-500/15 text-brand-300 min-h-11 shrink-0 rounded-md border px-3 text-sm font-semibold'
                  : 'border-surface-700 text-ink-300 min-h-11 shrink-0 rounded-md border px-3 text-sm'
              }
            >
              {dayLabel(d.dateKey)}
            </button>
          ))}
        </div>
      )}

      <Card className="border-brand-500/40 p-4">
        <p className="text-brand-300 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
          <Clock size={14} aria-hidden="true" /> Meilleur créneau estimé
          {best?.status === 'en_cours' && <Badge>en cours</Badge>}
          {best?.status === 'passe' && <Badge>déjà passé</Badge>}
        </p>
        {best ? (
          <>
            <p className="text-ink-100 mt-1 text-4xl font-bold tabular-nums">
              {windowLabel(best.main)}
            </p>
            <p className="text-ink-300 text-sm">{durationLabel(best.main)}</p>
            {best.earlierBest && (
              <p className="text-ink-400 mt-1 text-xs">
                Le meilleur créneau du jour ({windowLabel(best.earlierBest)}) est déjà
                passé ; voici le meilleur restant.
              </p>
            )}
            {best.status === 'passe' && (
              <p className="text-ink-400 mt-1 text-xs">
                Tous les créneaux de ce jour sont passés.
              </p>
            )}
            <ul className="text-ink-200 mt-3 flex flex-col gap-1 text-sm">
              {reasons.map((r) => (
                <li key={r} className="flex gap-2">
                  <span aria-hidden="true" className="text-brand-400">
                    •
                  </span>
                  {r}
                </li>
              ))}
            </ul>
            {best.alternative && (
              <p className="text-ink-300 mt-3 text-sm">
                Alternative : <strong>{windowLabel(best.alternative)}</strong>
              </p>
            )}
            {(day.robustness === 'equivalent' || day.robustness === 'fragile') && (
              <p className="text-status-warning mt-2 text-xs">
                {ROBUSTNESS_TEXT[day.robustness]}
              </p>
            )}
          </>
        ) : (
          <p className="text-ink-300 mt-2 text-sm">
            Aucun créneau n’atteint le seuil ce jour-là, ou les données sont insuffisantes
            pour en désigner un.
          </p>
        )}
        <p className="text-ink-500 mt-3 text-xs">
          Estimation comparative — pas une garantie de présence.
          {!weatherDrivesRanking(day) &&
            ' La météo ne modifie pas ce classement (aucune donnée évaluée).'}
        </p>
      </Card>

      <Card className="p-3">
        <HourlyChart day={day} timeZone={tz} />
      </Card>

      {brief && (
        <section aria-label="Météo au créneau" className="grid grid-cols-4 gap-1.5">
          <Stat label="Temp." value={num(brief.temperatureC, '°C', 1)} />
          <Stat
            label="Vent"
            value={num(brief.windKmh, 'km/h')}
            sub={brief.windFrom ? `du ${brief.windFrom}` : undefined}
          />
          <Stat label="Pluie" value={num(brief.rainMm, 'mm', 1)} />
          <Stat
            label="Pression"
            value={num(brief.pressureHpa, 'hPa')}
            sub={brief.pressureTrend ?? undefined}
          />
        </section>
      )}

      <Card className="p-3">
        <p className="text-ink-300 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
          <MapPin size={14} aria-hidden="true" /> Où
        </p>
        {top ? (
          <p className="text-ink-100 mt-1 text-sm">
            <strong>Point {top.id}</strong> — rang {top.grade}, {top.score}/100
            <span className="text-ink-300"> · {top.reasons.slice(0, 2).join(' · ')}</span>
          </p>
        ) : spatial ? (
          <p className="text-ink-300 mt-1 text-sm">
            Aucun point candidat défendable dans l’emprise de {spatial.extent.radiusM} m.
          </p>
        ) : (
          <p className="text-ink-300 mt-1 text-sm">
            Occupation du sol indisponible (réseau) : aucun secteur ni point. Rien n’est
            inventé.
          </p>
        )}
        {spatial && (
          <p className="text-ink-500 mt-1 text-xs">
            {spatial.sectors.length} secteur(s) ·{' '}
            {formatLatitude(spatial.extent.center.lat)}{' '}
            {formatLongitude(spatial.extent.center.lng)}
          </p>
        )}
        <Button
          type="button"
          className="mt-2 w-full"
          disabled={!spatial}
          onClick={() => {
            requestFocus()
            navigate('/map')
          }}
        >
          Voir sur la carte
        </Button>
      </Card>

      <div className="flex flex-col gap-2">
        <Fold title="Pourquoi ce créneau ? Détails et calendrier">
          <WhenDetails hunt={hunt} day={day} selected={selected} onSelect={setSelected} />
        </Fold>
        <Fold title="Température et pression (contexte)">
          <div className="flex flex-col gap-3">
            <TemperaturePanel day={day} />
            <PressurePanel day={day} />
          </div>
        </Fold>
        <Fold title="Secteurs, points et corridors">
          <WhereTab spatial={spatial} />
        </Fold>
        <Fold title="Formule, méthodologie et limites">
          <HowTab hunt={hunt} spatial={spatial} />
        </Fold>
        <Fold title="Sources, règles et bibliographie">
          <SourcesPanel record={record} />
        </Fold>
      </div>
      <p className="text-ink-600 flex items-center gap-1 text-[11px]">
        <Sun size={12} aria-hidden="true" /> Moteur {hunt.engineVersion} · registre{' '}
        {hunt.registryVersion}
      </p>
    </div>
  )
}
