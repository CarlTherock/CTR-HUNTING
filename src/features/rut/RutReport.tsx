import {
  AXIS_END,
  AXIS_START,
  GESTATION_NOTE,
  GPS_NOTE,
  POSITION_LABEL,
  SEASONAL_BANDS,
  axisFraction,
  bandPosition,
  dateFraction,
} from './seasonalBands'
import { GROUP_LABEL } from './observationsSummary'
import type { ObservationsSummary, SourceGroup } from './observationsSummary'
import { RUT_SOURCES } from './sources'

interface Props {
  /** `YYYY-MM-DD` on the place's calendar. */
  dateKey: string
  summary: ObservationsSummary
}

const W = 320
const PAD = 12

/**
 * One reusable template (HTML + SVG, no decorative image) rendered both in the
 * app preview and by the browser print dialog (« Enregistrer en PDF »). A PNG
 * export can reuse the same node later.
 */
export function RutReport({ dateKey, summary }: Props) {
  const year = Number(dateKey.slice(0, 4))
  const x = (f: number) => PAD + f * (W - 2 * PAD)
  const marker = dateFraction(dateKey)
  const ticks = [
    { month: 10, day: 15 },
    { month: 11, day: 1 },
    { month: 12, day: 1 },
    { month: 12, day: 31 },
  ]
  return (
    <article
      data-testid="rut-report"
      className="rut-report space-y-4 rounded-lg border border-slate-700 bg-slate-900 p-4 text-slate-100"
    >
      <header>
        <h2 className="text-lg font-semibold">
          Repères saisonniers du rut — contexte québécois
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          Contexte documentaire — pas un prédicteur local. {GPS_NOTE}
        </p>
      </header>

      <section aria-label="Bandes saisonnières" className="space-y-2">
        <svg
          viewBox={`0 0 ${W} 120`}
          role="img"
          aria-label={`Deux bandes de contexte séparées du ${AXIS_START.day} octobre au ${AXIS_END.day} décembre ${year}`}
          className="w-full"
        >
          {SEASONAL_BANDS.map((b, i) => {
            const y = 20 + i * 36
            const x1 = x(axisFraction(year, b.start))
            const x2 = x(axisFraction(year, b.end))
            return (
              <g key={b.id}>
                <rect
                  x={x1}
                  y={y}
                  width={Math.max(2, x2 - x1)}
                  height={22}
                  rx={4}
                  fill={b.origin === 'quebec' ? '#22c55e' : 'none'}
                  fillOpacity={0.55}
                  stroke={b.origin === 'quebec' ? '#22c55e' : '#f59e0b'}
                  strokeWidth={1.5}
                  strokeDasharray={b.origin === 'quebec' ? undefined : '4 3'}
                />
                <text
                  x={x2 - x1 < 100 ? x2 + 5 : x1 + 4}
                  y={y + 15}
                  fontSize={9}
                  fill="#f1f5f9"
                >
                  {b.origin === 'quebec' ? 'Québec' : 'Wisconsin (externe)'}
                </text>
              </g>
            )
          })}
          <line
            x1={x(marker)}
            x2={x(marker)}
            y1={8}
            y2={98}
            stroke="#38bdf8"
            strokeWidth={2}
          />
          <text x={x(marker)} y={7} fontSize={8} fill="#38bdf8" textAnchor="middle">
            {dateKey.slice(8)}/{dateKey.slice(5, 7)}
          </text>
          {ticks.map((t) => (
            <text
              key={`${t.month}-${t.day}`}
              x={x(axisFraction(year, t))}
              y={112}
              fontSize={8}
              fill="#94a3b8"
              textAnchor="middle"
            >
              {t.day}/{t.month}
            </text>
          ))}
        </svg>
        <ul className="space-y-2 text-sm">
          {SEASONAL_BANDS.map((b) => (
            <li key={b.id} data-testid={`rut-band-${b.id}`}>
              <p className="font-medium">
                {b.label} —{' '}
                <span className="text-sky-300">
                  {POSITION_LABEL[bandPosition(dateKey, b)]}
                </span>
              </p>
              <p className="text-xs text-slate-400">{b.statement}</p>
              <p className="text-xs font-medium text-amber-300">{b.caveat}</p>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-400">
          Les deux bandes sont affichées séparément et ne sont ni fusionnées ni
          transformées en courbe : aucun pic quotidien n’est proposé. {GESTATION_NOTE}
        </p>
      </section>

      <section
        aria-label="Mes observations"
        data-testid="rut-observations"
        className="space-y-2"
      >
        <h3 className="text-sm font-semibold">Mes observations (descriptif)</h3>
        {summary.entries === 0 ? (
          <p className="text-sm text-slate-300">{summary.statement}</p>
        ) : (
          <>
            <ul className="grid grid-cols-3 gap-2 text-center">
              {(Object.keys(GROUP_LABEL) as SourceGroup[]).map((g) => (
                <li key={g} className="rounded border border-slate-700 p-2">
                  <p className="text-xl font-semibold">{summary.byGroup[g].events}</p>
                  <p className="text-[11px] text-slate-400">{GROUP_LABEL[g]}</p>
                  {summary.byGroup[g].entries !== summary.byGroup[g].events && (
                    <p className="text-[10px] text-slate-500">
                      {summary.byGroup[g].entries} entrées
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-300">
              {summary.daysWithEntries} jour(s) avec observation sur {summary.daysSpan}{' '}
              jour(s) couverts ({summary.firstDay} → {summary.lastDay}).{' '}
              {summary.hasEffort
                ? `${summary.effortDays} jour(s) avec sortie enregistrée.`
                : 'Aucune sortie enregistrée.'}
            </p>
            <p className="text-xs text-slate-400">{summary.statement}</p>
            <p className="text-[11px] text-slate-500">
              Les entrées proches dans le temps et l’espace (séquence de photos) comptent
              pour un seul événement. Les caméras reconnues sont celles de vos repères «
              caméra de chasse » ; leurs déclenchements ne sont pas enregistrés.
            </p>
          </>
        )}
      </section>

      <section aria-label="Sources" className="space-y-1">
        <h3 className="text-sm font-semibold">Sources</h3>
        <ul className="space-y-1 text-[11px] text-slate-400">
          {RUT_SOURCES.map((s) => (
            <li key={s.id}>
              {s.citation} {s.displayedDate ? `${s.displayedDate}. ` : ''}Consultée le{' '}
              {s.accessedOn}. {s.readScope} {s.discrepancy ?? ''}
            </li>
          ))}
        </ul>
      </section>
    </article>
  )
}
