import { useEffect, useMemo } from 'react'
import { Sunrise, Sunset } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui'
import type { Coordinate } from '@/types'
import { formatDateKey } from '@/features/weather/offline/savedForecastLogic'
import { computeHuntingWindow, computeSunDay, windowPosition } from './huntingWindow'
import { QUEBEC_GENERAL_RULE } from './huntingRules'
import { useHuntingRuleStore } from './huntingRuleStore'
import { zonedDateKey } from './zonedTime'

const POSITION_TEXT = {
  before: 'Avant le début de la plage horaire calculée',
  inside: 'Dans la plage horaire calculée',
  after: 'Après la fin de la plage horaire calculée',
} as const

/**
 * « Soleil et heures de chasse » — three things kept apart on screen:
 * the astronomical sun, the window computed with a chosen rule, and the real
 * authorization (which the app never claims to know).
 */
export function SunHuntingCard({
  coordinate,
  placeName,
  dateKey,
  timezone,
  now,
}: {
  coordinate: Coordinate
  placeName: string
  dateKey: string
  timezone: string
  now: Date
}) {
  const ruleId = useHuntingRuleStore((s) => s.ruleId)
  const loaded = useHuntingRuleStore((s) => s.loaded)
  const load = useHuntingRuleStore((s) => s.load)
  const choose = useHuntingRuleStore((s) => s.choose)

  useEffect(() => {
    void load()
  }, [load])

  const sun = useMemo(
    () => computeSunDay({ coordinate, dateKey, timezone }),
    [coordinate, dateKey, timezone],
  )
  const window = useMemo(
    () => computeHuntingWindow(sun, coordinate, ruleId),
    [sun, coordinate, ruleId],
  )
  const isToday = (() => {
    try {
      return zonedDateKey(now, timezone) === dateKey
    } catch {
      return false
    }
  })()
  const position = isToday ? windowPosition(window, now) : null
  const rule = QUEBEC_GENERAL_RULE

  return (
    <Card data-testid="sun-hunting">
      <CardHeader>
        <CardTitle>Soleil et heures de chasse</CardTitle>
        <CardDescription>
          {placeName} ({coordinate.lat.toFixed(4)}, {coordinate.lng.toFixed(4)}) ·{' '}
          {formatDateKey(dateKey)} · heure locale du lieu ({timezone})
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <section aria-label="Soleil" className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <Sunrise size={20} className="text-brand-400 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-ink-100 text-lg font-semibold" data-testid="sunrise">
                {sun.sunriseClock ?? 'indisponible'}
              </p>
              <p className="text-ink-500 text-xs">Lever du soleil</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Sunset size={20} className="text-brand-400 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-ink-100 text-lg font-semibold" data-testid="sunset">
                {sun.sunsetClock ?? 'indisponible'}
              </p>
              <p className="text-ink-500 text-xs">Coucher du soleil</p>
            </div>
          </div>
          <p className="text-ink-500 col-span-2 text-xs">
            Heures astronomiques calculées par l’application, sans réseau.
          </p>
        </section>

        <section
          aria-label="Plage horaire calculée"
          className="border-surface-700 border-t pt-3"
        >
          {window.state === 'computed' && window.rule ? (
            <>
              <p className="text-ink-300 text-xs font-semibold">
                Règle appliquée : {window.rule.title}
              </p>
              <p className="text-ink-100 mt-1 text-lg font-semibold" data-testid="window">
                {window.startClock} – {window.endClock}
              </p>
              <p className="text-ink-500 text-xs">
                Plage horaire calculée (pas une autorisation)
              </p>
              {position && (
                <Badge
                  variant={position === 'inside' ? 'success' : 'warning'}
                  className="mt-2"
                >
                  {POSITION_TEXT[position]}
                </Badge>
              )}
              <p className="text-ink-300 mt-2 text-xs">{window.rule.summary}</p>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2"
                onClick={() => void choose(null)}
              >
                Retirer la règle
              </Button>
            </>
          ) : (
            <>
              <p className="text-ink-300 text-sm" data-testid="no-window">
                {window.reason}
              </p>
              {loaded && ruleId === null && (
                <div className="mt-2">
                  <p className="text-ink-500 mb-2 text-xs">
                    Seule la règle générale du Québec est prise en charge. Appliquez-la
                    seulement si vous chassez au Québec.
                  </p>
                  <Button
                    size="md"
                    variant="secondary"
                    onClick={() => void choose(rule.id)}
                  >
                    Je chasse au Québec : appliquer la règle générale
                  </Button>
                </div>
              )}
              {ruleId !== null && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-2"
                  onClick={() => void choose(null)}
                >
                  Retirer la règle
                </Button>
              )}
            </>
          )}
        </section>

        <p className="text-status-warning text-xs">
          L’autorisation réelle de chasser n’est pas vérifiée par l’application : saisons,
          zones, espèces, permis et restrictions doivent être vérifiés séparément.
        </p>

        <details className="text-ink-300 text-xs">
          <summary className="text-brand-400 min-h-11 cursor-pointer py-3">
            Source, règle et limites
          </summary>
          <div className="flex flex-col gap-2 pb-1">
            <p>
              <span className="text-ink-100">Règle :</span> {rule.title}. {rule.summary}
            </p>
            <p>
              <span className="text-ink-100">Cas où la plage n’est pas calculée :</span>
            </p>
            <ul className="list-disc pl-5">
              {rule.exceptions.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            <ul className="list-disc pl-5">
              {rule.reminders.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <p>
              <span className="text-ink-100">Source :</span>{' '}
              <a
                href={rule.source.url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-brand-400 break-all underline"
              >
                {rule.source.title}
              </a>
              . Page mise à jour le {formatDateKey(rule.source.pageUpdatedOn)} · règle
              vérifiée le {formatDateKey(rule.source.verifiedOn)}. {rule.source.note}
            </p>
            <p>
              Un téléchargement météo ne met pas ces règles à jour : elles changent
              seulement avec une nouvelle version de l’application.
            </p>
          </div>
        </details>
      </CardContent>
    </Card>
  )
}
