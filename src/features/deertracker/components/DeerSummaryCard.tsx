import { Card } from '@/components/ui'
import type { DeerSummary } from '../deerLogic'
import { DEER_DISCLAIMER, DEER_KIND_LABEL } from '../deerLogic'

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString('fr-CA')
}

/** Deterministic summary of the entries currently shown. Plain counts of what
 * was entered: no score, no probability, no inferred movement. */
export function DeerSummaryCard({ summary }: { summary: DeerSummary }) {
  const maxHour = Math.max(1, ...summary.perHour)
  return (
    <Card className="flex flex-col gap-3 p-3" aria-label="Résumé de la période">
      <h2 className="text-ink-100 text-sm font-semibold">
        Résumé de la période affichée
      </h2>
      {summary.entries === 0 ? (
        <p className="text-ink-300 text-sm">Aucune observation dans cette sélection.</p>
      ) : (
        <>
          <p className="text-ink-100 text-sm" data-testid="deer-summary-count">
            <strong>{summary.entries}</strong> observation(s) enregistrée(s)
            {summary.period &&
              ` · du ${fmtDate(summary.period.fromMs)} au ${fmtDate(summary.period.toMs)}`}
          </p>
          <p className="text-ink-300 text-xs">
            Animaux comptés par vous : {summary.animalsCounted}
            {summary.withoutCount > 0 &&
              ` · ${summary.withoutCount} entrée(s) sans nombre saisi (non comptées)`}
          </p>

          <div>
            <p className="text-ink-100 text-xs font-semibold">Types</p>
            <ul className="text-ink-300 flex flex-wrap gap-x-3 text-xs">
              {summary.kinds.map((k) => (
                <li key={k.kind}>
                  {DEER_KIND_LABEL[k.kind]} : {k.count}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-ink-100 text-xs font-semibold">Répartition horaire</p>
            <div
              role="img"
              aria-label={`Observations par heure : ${summary.perHour
                .map((n, h) => (n > 0 ? `${h} h : ${n}` : null))
                .filter(Boolean)
                .join(', ')}`}
              className="flex h-12 items-end gap-px"
            >
              {summary.perHour.map((n, hour) => (
                <span
                  key={hour}
                  className="bg-brand-500/70 min-w-0 flex-1 rounded-t-sm"
                  style={{
                    height: `${n === 0 ? 2 : Math.max(8, (n / maxHour) * 100)}%`,
                    opacity: n === 0 ? 0.25 : 1,
                  }}
                />
              ))}
            </div>
            <div className="text-ink-500 flex justify-between text-[10px]">
              <span>0 h</span>
              <span>6 h</span>
              <span>12 h</span>
              <span>18 h</span>
              <span>23 h</span>
            </div>
            <ul className="text-ink-300 mt-1 flex flex-wrap gap-x-3 text-xs">
              {summary.perHour.map((n, h) =>
                n > 0 ? (
                  <li key={h}>
                    {h} h : {n}
                  </li>
                ) : null,
              )}
            </ul>
          </div>

          <div>
            <p className="text-ink-100 text-xs font-semibold">Territoires concernés</p>
            <ul className="text-ink-300 flex flex-wrap gap-x-3 text-xs">
              {summary.territories.map((t) => (
                <li key={t.label}>
                  {t.label} : {t.count}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-ink-100 text-xs font-semibold">
              Conditions présentes dans les relevés
            </p>
            {summary.conditions.entriesWithConditions === 0 ? (
              <p className="text-ink-300 text-xs">Aucune condition enregistrée.</p>
            ) : (
              <p className="text-ink-300 text-xs">
                {summary.conditions.entriesWithConditions} relevé(s) avec conditions
                {summary.conditions.temperature &&
                  ` · température de ${Math.round(summary.conditions.temperature.min)} à ${Math.round(summary.conditions.temperature.max)} °C`}
                {summary.conditions.wind &&
                  ` · vent de ${Math.round(summary.conditions.wind.min)} à ${Math.round(summary.conditions.wind.max)} km/h`}
              </p>
            )}
          </div>
        </>
      )}
      <p className="text-ink-500 text-xs">{DEER_DISCLAIMER}</p>
    </Card>
  )
}
