import { useNavigate } from 'react-router-dom'
import { Badge, Card } from '@/components/ui'
import type { BadgeVariant } from '@/components/ui'
import { NATURE_HELP, NATURE_ORDER } from '../nature'
import { canViewOnMap, openRef, primaryActionOf, viewRefOnMap } from '../links'
import type { AssistantResult, EntityRef, Statement, StatementNature } from '../types'
import { ConsentPreview } from './ConsentPreview'

const NATURE_VARIANT: Record<StatementNature, BadgeVariant> = {
  'fait enregistré': 'success',
  calcul: 'info',
  estimation: 'warning',
  'interprétation IA': 'danger',
}

/** Étiquette de nature affichée devant chaque énoncé. */
export function NatureBadge({ nature }: { nature: StatementNature }) {
  return (
    <Badge variant={NATURE_VARIANT[nature]} className="shrink-0 whitespace-nowrap">
      {nature}
    </Badge>
  )
}

const BUTTON =
  'border-surface-600 text-ink-100 hover:bg-surface-800 focus-visible:outline-brand-400 inline-flex min-h-11 max-w-full min-w-11 items-center justify-center rounded-md border px-3 text-xs outline-none focus-visible:outline-2'

/** Lien vers un élément cité : le bouton ouvre l'élément (jamais ne le modifie). */
export function RefButtons({ refs }: { refs: EntityRef[] }) {
  const navigate = useNavigate()
  if (refs.length === 0) return null
  const INLINE = 3
  const inline = refs.slice(0, INLINE)
  const rest = refs.slice(INLINE)

  const renderRef = (ref: EntityRef) => {
    const action = primaryActionOf(ref)
    return (
      <li key={`${ref.kind}:${ref.id}`} className="flex max-w-full flex-wrap gap-1">
        <button
          type="button"
          className={BUTTON}
          data-testid="ref-open"
          data-ref={`${ref.kind}:${ref.id}`}
          aria-label={`${action.hint} : ${ref.label}`}
          onClick={() => openRef(ref, navigate)}
        >
          <span className="max-w-[16rem] truncate">{ref.label}</span>
          <span className="text-brand-400 ml-2 shrink-0">· {action.label}</span>
        </button>
        {ref.kind !== 'cell' && canViewOnMap(ref) && (
          <button
            type="button"
            className={BUTTON}
            aria-label={`Voir sur la carte : ${ref.label}`}
            onClick={() => viewRefOnMap(ref, navigate)}
          >
            Carte
          </button>
        )}
      </li>
    )
  }

  return (
    <div className="mt-1 flex flex-col gap-1">
      <ul className="flex flex-wrap gap-1" aria-label="Éléments cités">
        {inline.map(renderRef)}
      </ul>
      {rest.length > 0 && (
        <details>
          <summary className="text-brand-400 flex min-h-11 cursor-pointer items-center text-xs">
            {rest.length} autre(s) élément(s) cité(s)
          </summary>
          <ul className="flex flex-wrap gap-1 pb-1" aria-label="Autres éléments cités">
            {rest.map(renderRef)}
          </ul>
        </details>
      )}
    </div>
  )
}

export function StatementItem({ statement }: { statement: Statement<StatementNature> }) {
  return (
    <li className="flex flex-col gap-1 py-2" data-nature={statement.nature}>
      <div className="flex items-start gap-2">
        <NatureBadge nature={statement.nature} />
        {/* Texte rendu comme TEXTE (React échappe tout) : une note qui contient
            du HTML ou une consigne s'affiche telle quelle, rien ne s'exécute. */}
        <p className="text-ink-100 min-w-0 text-sm break-words">{statement.text}</p>
      </div>
      <RefButtons refs={statement.refs} />
    </li>
  )
}

function ContextDetails({ result }: { result: AssistantResult }) {
  const { context } = result
  return (
    <details className="text-sm" data-testid="assistant-context">
      <summary className="text-brand-400 flex min-h-11 cursor-pointer items-center">
        Données utilisées et traçabilité
      </summary>
      <dl className="text-ink-300 flex flex-col gap-3 pb-2 text-xs">
        <div>
          <dt className="text-ink-100 font-medium">Calculé le</dt>
          <dd>{new Date(context.generatedAt).toLocaleString('fr-CA')}</dd>
        </div>
        {context.dataUsed.length > 0 && (
          <div>
            <dt className="text-ink-100 font-medium">Données utilisées</dt>
            <dd>
              <ul className="list-disc pl-4">
                {context.dataUsed.map((text) => (
                  <li key={text} className="break-words">
                    {text}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        {context.dates.length > 0 && (
          <div>
            <dt className="text-ink-100 font-medium">Dates</dt>
            <dd>
              <ul className="list-disc pl-4">
                {context.dates.map((d) => (
                  <li key={`${d.label}:${d.value}`} className="break-words">
                    {d.label} : {d.value}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        {context.sources.length > 0 && (
          <div>
            <dt className="text-ink-100 font-medium">Sources</dt>
            <dd>
              <ul className="list-disc pl-4">
                {context.sources.map((s) => (
                  <li key={s} className="break-words">
                    {s}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        {context.factors.length > 0 && (
          <div>
            <dt className="text-ink-100 font-medium">
              Facteurs ({context.factors.length})
            </dt>
            <dd>
              <ul className="list-disc pl-4">
                {context.factors.map((f, i) => (
                  <li key={`${f.group}:${f.label}:${i}`} className="break-words">
                    {f.group} — {f.label} :{' '}
                    {f.counted
                      ? `contribution ${f.contribution}, poids ${f.weight}`
                      : 'information, non comptée'}{' '}
                    ({f.nature})
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        <div>
          <dt className="text-ink-100 font-medium">Données manquantes</dt>
          <dd>
            {context.missingData.length === 0 ? (
              'Aucune signalée.'
            ) : (
              <ul className="list-disc pl-4">
                {context.missingData.map((m) => (
                  <li key={m} className="break-words">
                    {m}
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-ink-100 font-medium">
            Éléments consultés ({context.consultedTotal})
          </dt>
          <dd>
            {context.consulted.length === 0 ? (
              'Aucun.'
            ) : (
              <ul className="flex flex-col gap-0.5">
                {context.consulted.map((ref) => (
                  <li key={`${ref.kind}:${ref.id}`} className="break-all">
                    {ref.kind} <code>{ref.id}</code>
                  </li>
                ))}
              </ul>
            )}
            {context.consultedTotal > context.consulted.length && (
              <p>
                {context.consultedTotal - context.consulted.length} autre(s) non listé(s)
                ici.
              </p>
            )}
          </dd>
        </div>
      </dl>
    </details>
  )
}

/**
 * Affiche un résultat de l'assistant : origine (« Calcul / résumé
 * automatique », jamais « IA générative »), sections, énoncés étiquetés par
 * nature, liens vers les éléments, contexte de traçabilité et aperçu du
 * consentement (inactif).
 */
export function ResultView({ result }: { result: AssistantResult }) {
  return (
    <Card
      className="flex min-w-0 flex-col gap-3 p-3 sm:p-4"
      data-testid="assistant-result"
    >
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-ink-100 text-base font-semibold break-words">
            {result.title}
          </h2>
          <Badge variant="brand" data-testid="origin-badge">
            {result.originLabel}
          </Badge>
        </div>
        <p className="text-ink-500 text-xs">
          Produit par des règles de l’application à partir de vos données, sur l’appareil.
          Aucune IA générative n’a écrit ce texte.
        </p>
      </div>

      <details className="text-xs">
        <summary className="text-brand-400 flex min-h-11 cursor-pointer items-center">
          Que signifient les étiquettes ?
        </summary>
        <ul className="flex flex-col gap-1 pb-2">
          {NATURE_ORDER.map((nature) => (
            <li key={nature} className="flex items-start gap-2">
              <NatureBadge nature={nature} />
              <span className="text-ink-300 min-w-0 break-words">
                {NATURE_HELP[nature]}
              </span>
            </li>
          ))}
        </ul>
      </details>

      <div className="flex max-h-[min(70dvh,44rem)] flex-col gap-4 overflow-y-auto overscroll-contain pr-1">
        {result.sections.map((section) => (
          <section key={section.heading} aria-label={section.heading}>
            <h3 className="text-ink-300 border-surface-700 border-b pb-1 text-sm font-semibold break-words">
              {section.heading}
            </h3>
            <ul className="divide-surface-800 divide-y">
              {section.statements.map((statement) => (
                <StatementItem key={statement.id} statement={statement} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <ContextDetails result={result} />
      <ConsentPreview result={result} />
    </Card>
  )
}
