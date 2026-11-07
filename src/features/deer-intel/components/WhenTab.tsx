import { useState } from 'react'
import { Card } from '@/components/ui'
import type { DayAnalysis, HuntAnalysis, HuntWindow } from '../engine'
import { getRule } from '../rules/registry'
import { DayComparison } from './DayComparison'
import { HourlyChart } from './HourlyChart'
import { ROBUSTNESS_TEXT, dayLabel, windowLabel } from './format'

function mean(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null)
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null
}

function WhyCard({ day, window: w }: { day: DayAnalysis; window: HuntWindow }) {
  const slots = day.slots.filter((s) => s.startIso >= w.startIso && s.startIso < w.endIso)
  const activity = mean(slots.map((s) => s.activity))
  const conditions = mean(slots.map((s) => s.conditions))
  const factorIds = [...new Set(slots.flatMap((s) => s.factors.map((f) => f.id)))]
  return (
    <details className="border-surface-700 bg-surface-900 rounded-md border p-3" open>
      <summary className="text-ink-100 min-h-11 cursor-pointer text-sm font-semibold">
        Pourquoi ce créneau ? ({windowLabel(w)})
      </summary>
      <ul className="text-ink-300 mt-2 flex flex-col gap-1.5 text-sm">
        <li>
          <strong>Activité de référence</strong> : {activity ?? 'indisponible'}/100 en
          moyenne. Forme crépusculaire ancrée sur le lever (
          {day.sun.sunrise ? 'calculé' : 'absent'}) et le coucher locaux — règle{' '}
          {getRule('ACT-CREPUSCULAR-01')?.status}, hauteur des pics choisie par
          conception.
        </li>
        <li>
          <strong>Conditions de chasse</strong> :{' '}
          {conditions === null
            ? 'non évaluées (aucune donnée météo ou aucun réglage de poste) — l’indice se limite à l’activité de référence.'
            : `${conditions}/100 en moyenne (${factorIds.length} facteur(s) : ${slots[0]?.factors
                .filter((f) => f.score !== null)
                .map((f) => f.label)
                .join(', ')}).`}
        </li>
        <li>
          <strong>Indice</strong> : {Math.round(w.meanIndex)} en moyenne (max{' '}
          {Math.round(w.maxIndex)}) — 65 % activité + 35 % conditions quand les deux
          existent. Indice comparatif, pas une probabilité de présence ni de récolte.
        </li>
        {!w.comparable && (
          <li className="text-status-warning">
            Les heures de ce créneau n’ont pas toutes les mêmes facteurs : lecture moins
            comparable.
          </li>
        )}
        <li>{day.robustnessNote || ROBUSTNESS_TEXT[day.robustness]}</li>
      </ul>
    </details>
  )
}

/** QUAND : créneaux, graphique horaire, comparaison des jours, contexte du rut et de la lune. */
export function WhenTab({ hunt }: { hunt: HuntAnalysis }) {
  const [selected, setSelected] = useState(0)
  const day = hunt.days[Math.min(selected, hunt.days.length - 1)]
  const rut = getRule('INF-RUT-01')
  const clock = (d: Date | null) =>
    d
      ? new Intl.DateTimeFormat('fr-CA', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: hunt.params.timezone,
        }).format(d)
      : 'aucun'
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-3">
        <h2 className="text-ink-100 text-sm font-semibold">
          {dayLabel(day.dateKey)} — {hunt.params.timezone}
        </h2>
        {day.windows.length > 0 ? (
          <ol className="mt-2 flex flex-col gap-1.5">
            {day.windows.map((w, i) => (
              <li
                key={w.startIso}
                className="bg-surface-800 text-ink-100 flex items-center justify-between rounded-md px-3 py-2 text-sm"
              >
                <span className="font-semibold tabular-nums">
                  {i + 1}. {windowLabel(w)}
                </span>
                <span className="text-ink-300 tabular-nums">
                  indice {Math.round(w.meanIndex)} · {w.hours} h
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-ink-300 mt-2 text-sm">
            Aucun créneau n’atteint le seuil ce jour-là.
          </p>
        )}
        <p className="text-ink-300 mt-2 text-sm">{ROBUSTNESS_TEXT[day.robustness]}</p>
        <p className="text-ink-500 mt-1 text-xs">
          {day.planningRange.label}. Plage de planification, pas une autorisation de
          chasser : la saison, la zone, le permis et les restrictions se vérifient
          séparément.
        </p>
      </Card>

      <HourlyChart day={day} />

      {day.windows[0] && <WhyCard day={day} window={day.windows[0]} />}

      <section aria-label="Comparer les jours">
        <h2 className="text-ink-100 mb-2 text-sm font-semibold">Comparer les jours</h2>
        <DayComparison days={hunt.days} selected={selected} onSelect={setSelected} />
      </section>

      <Card className="p-3">
        <h2 className="text-ink-100 text-sm font-semibold">
          Soleil et lune (calcul astronomique)
        </h2>
        <dl className="text-ink-300 mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          <dt>Lever du soleil</dt>
          <dd className="tabular-nums">{clock(day.sun.sunrise)}</dd>
          <dt>Coucher du soleil</dt>
          <dd className="tabular-nums">{clock(day.sun.sunset)}</dd>
          <dt>Lune</dt>
          <dd>
            {day.moon.phaseName}, {Math.round(day.moon.illuminationFraction * 100)} %
            éclairée
          </dd>
          <dt>Lever / coucher de la lune</dt>
          <dd className="tabular-nums">
            {clock(day.moon.rise)} / {clock(day.moon.set)}
          </dd>
          <dt>Passage haut / bas</dt>
          <dd className="tabular-nums">
            {clock(day.moon.upperTransit)} / {clock(day.moon.lowerTransit)}
          </dd>
        </dl>
        <p className="text-ink-500 mt-2 text-xs">
          Aucun bonus lunaire n’est appliqué par défaut : les études sont contradictoires
          (Sullivan 2016 vs Mississippi State 2025, Webb 2010). « aucun » = événement
          absent ce jour-là. La fraction éclairée n’est pas la lumière disponible (nuages,
          horizon).
        </p>
      </Card>

      <Card className="p-3">
        <h2 className="text-ink-100 text-sm font-semibold">Variantes du premier jour</h2>
        <ul className="text-ink-300 mt-2 flex flex-col gap-1 text-sm">
          {hunt.variants.map((v) => (
            <li key={v.id}>
              <strong>{v.label}</strong> : {v.explanation}
            </li>
          ))}
        </ul>
      </Card>

      {rut && (
        <Card className="p-3">
          <h2 className="text-ink-100 text-sm font-semibold">
            Contexte saisonnier (rut)
          </h2>
          <p className="text-ink-300 mt-1 text-sm">{rut.result}</p>
          <p className="text-ink-500 mt-1 text-xs">{rut.transferLimits}</p>
        </Card>
      )}
    </div>
  )
}
