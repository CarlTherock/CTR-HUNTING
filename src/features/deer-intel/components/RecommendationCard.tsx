import { useEffect, useMemo } from 'react'
import { Compass } from 'lucide-react'
import { Card } from '@/components/ui'
import { useJournalStore } from '@/features/journal/state/journalStore'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { GROUP_LABEL, summarizeObservations } from '@/features/rut/observationsSummary'
import { recommend } from '@/features/rut/recommendation'
import {
  INDICATIVE_NOTICE,
  rankDays,
  recommendationText,
} from '@/features/rut/recommendationText'
import { EXTERNAL_REFERENCE, METHOD_VERSION } from '@/features/rut/seasonalAdvice'
import { classifyTerritory } from '@/features/rut/territory'
import type { SavedHuntAnalysis } from '@/types'
import { dayLabel } from './format'

const POSITION_NOTE: Record<string, string> = {
  hors_territoire: 'Point hors du territoire documenté.',
  incertain:
    'Point proche d’une limite du territoire : appartenance au Québec non établie.',
  anticosti: 'Anticosti : contexte particulier, non intégré.',
  madeleine: 'Îles-de-la-Madeleine : aucun repère documenté.',
  quebec: 'Québec continental.',
}

/**
 * « Recommandation » : première chose affichée. Elle ne recalcule rien : elle lit le résultat
 * du moteur (`SavedHuntAnalysis`) et applique la couche saisonnière qualitative.
 */
export function RecommendationCard({
  record,
  dayIndex,
}: {
  record: SavedHuntAnalysis
  dayIndex: number
}) {
  const observations = useJournalStore((s) => s.observations)
  const journalLoaded = useJournalStore((s) => s.loaded)
  const loadJournal = useJournalStore((s) => s.load)
  const tracks = useTracksStore((s) => s.tracks)
  const tracksLoaded = useTracksStore((s) => s.loaded)
  const loadTracks = useTracksStore((s) => s.load)
  useEffect(() => {
    if (!journalLoaded) void loadJournal()
    if (!tracksLoaded) void loadTracks()
  }, [journalLoaded, loadJournal, tracksLoaded, loadTracks])

  const hunt = record.hunt
  const tz = record.timezone
  const coordinate = hunt.params.coordinate
  const territory = useMemo(
    () => classifyTerritory(coordinate.lat, coordinate.lng).state,
    [coordinate.lat, coordinate.lng],
  )
  const summary = useMemo(
    () => summarizeObservations(observations, tracks, { timeZone: tz }),
    [observations, tracks, tz],
  )
  const hasPost =
    hunt.params.favorableWindFrom.length > 0 || hunt.params.sensitiveBearings.length > 0
  const recs = useMemo(
    () =>
      hunt.days.map((day) =>
        recommend({ day, timeZone: tz, territory, summary, hasPostInfo: hasPost }),
      ),
    [hunt.days, tz, territory, summary, hasPost],
  )
  const rec = recs[Math.min(dayIndex, recs.length - 1)]
  if (!rec) return null
  const text = recommendationText(rec)
  const dayRank =
    hunt.days.length > 1
      ? rankDays(
          hunt.days.map((d, i) => ({
            dateKey: d.dateKey,
            best:
              [...recs[i].windows].sort((a, b) => b.meanIndex - a.meanIndex)[0] ?? null,
          })),
        )
      : null

  return (
    <Card className="border-brand-500/50 p-4" data-testid="hunt-recommendation">
      <p className="text-brand-300 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
        <Compass size={14} aria-hidden="true" /> Recommandation
      </p>
      <p className="text-ink-100 mt-2 text-lg leading-snug font-semibold">
        {text.headline}
      </p>
      <ul className="text-ink-200 mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm">
        {text.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {text.alternative && (
        <p className="text-ink-300 mt-2 text-sm">{text.alternative}</p>
      )}
      {rec.ranking.state === 'equivalents' && !text.alternative && (
        <p className="text-ink-300 mt-2 text-sm">{rec.ranking.explanation}</p>
      )}
      {dayRank && dayRank.state !== 'insuffisant' && (
        <p className="text-ink-300 mt-2 text-sm">
          Journées :{' '}
          {dayRank.state === 'departage'
            ? `${dayLabel(dayRank.order[0])} en tête. ${dayRank.explanation}`
            : dayRank.explanation}
        </p>
      )}
      {text.mainLimit && (
        <p className="text-status-warning mt-2 text-sm">{text.mainLimit}</p>
      )}
      <p className="text-ink-400 mt-3 text-xs">{INDICATIVE_NOTICE}</p>

      <details className="border-surface-700 mt-3 rounded-lg border">
        <summary className="min-h-11 cursor-pointer px-3 py-3 text-sm font-semibold">
          Contexte saisonnier, informations manquantes et hypothèses
        </summary>
        <div className="border-surface-700 text-ink-300 flex flex-col gap-3 border-t p-3 text-sm">
          <section>
            <h3 className="text-ink-100 font-semibold">Contexte saisonnier</h3>
            <p>{rec.seasonal.headline}</p>
            <p className="text-ink-400 text-xs">{rec.seasonal.limits}</p>
            {rec.seasonal.breedingContext && (
              <p className="text-ink-400 text-xs">{rec.seasonal.breedingContext}</p>
            )}
            <p className="text-ink-400 text-xs">{rec.seasonal.dayRanking}</p>
            <p className="text-ink-400 text-xs">{POSITION_NOTE[territory]}</p>
          </section>
          <section>
            <h3 className="text-ink-100 font-semibold">
              Informations manquantes et conséquences
            </h3>
            {rec.missing.length === 0 ? (
              <p>Aucune information importante ne manque pour ce conseil.</p>
            ) : (
              <ul className="list-disc pl-5">
                {rec.missing.map((m) => (
                  <li key={m.id}>
                    {m.label} : {m.consequence}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h3 className="text-ink-100 font-semibold">Mes observations (descriptif)</h3>
            {summary.entries === 0 ? (
              <p>{summary.statement}</p>
            ) : (
              <>
                <p>
                  {(['direct', 'ground_sign', 'camera'] as const)
                    .map((g) => `${GROUP_LABEL[g]} : ${summary.byGroup[g].events}`)
                    .join(' · ')}
                </p>
                {rec.observationNote && (
                  <p className="text-ink-400 text-xs">{rec.observationNote}</p>
                )}
              </>
            )}
          </section>
          <section>
            <h3 className="text-ink-100 font-semibold">Hypothèses et règles du modèle</h3>
            <ul className="text-ink-400 list-disc pl-5 text-xs">
              <li>
                Repère externe : Wisconsin (résumé consulté seulement),{' '}
                {EXTERNAL_REFERENCE.startMonthDay} à {EXTERNAL_REFERENCE.endMonthDay},
                déplacements de mâles — transféré avec prudence, non calibré pour votre
                terrain.
              </li>
              <li>
                Transitions de {EXTERNAL_REFERENCE.transitionDays} jours avant et après :
                choix heuristique, ajustable, pas une phase biologique mesurée.
              </li>
              <li>
                Créneaux : activité de référence schématique (heuristique) mélangée aux
                conditions pratiques (65 % / 35 %, choix de conception non validé par les
                études). La sensibilité testée montre la robustesse aux réglages, pas la
                validité scientifique.
              </li>
              <li>Les horaires solaires ne sont pas des heures légales de chasse.</li>
              <li>
                Version de la méthode : {METHOD_VERSION}. Aucun pourcentage de chances de
                voir un cerf.
              </li>
            </ul>
          </section>
        </div>
      </details>
    </Card>
  )
}
