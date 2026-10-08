import { Link } from 'react-router-dom'
import { Check, Minus, X } from 'lucide-react'
import { Badge, InfoSection as Section, PageHeader } from '@/components/ui'
import type { BadgeVariant } from '@/components/ui'
import { APP_BUILD_DATE, APP_NAME, APP_VERSION } from '@/app/appInfo'
import { formatDateFr } from '@/features/backup/restoreLabels'
import changelog from '../../../../CHANGELOG.md?raw'
import { parseChangelogHeadings } from '@/features/about/changelogHistory'
import { REPOSITORY_URL } from '@/features/about/docLinks'
import {
  PHASE_STATUS_LABEL,
  PRIORITIES,
  ROADMAP,
  VALIDATION_LABEL,
  VALIDATION_STATE_LABEL,
  roadmapSummary,
  type PhaseStatus,
  type PhaseValidation,
  type ValidationState,
} from '@/features/about/roadmap'

const STATUS_VARIANT: Record<PhaseStatus, BadgeVariant> = {
  done: 'success',
  partial: 'warning',
  'in-progress': 'info',
  todo: 'neutral',
}

function StateMark({ state }: { state: ValidationState }) {
  const Icon = state === 'yes' ? Check : state === 'partial' ? Minus : X
  const tone =
    state === 'yes'
      ? 'text-status-success'
      : state === 'partial'
        ? 'text-status-warning'
        : 'text-ink-500'
  return <Icon size={14} aria-hidden="true" className={tone} />
}

function ValidationRow({ validation }: { validation: PhaseValidation }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
      {(Object.keys(VALIDATION_LABEL) as (keyof PhaseValidation)[]).map((key) => (
        <div key={key} className="flex items-center justify-between gap-2">
          <dt className="text-ink-500 text-xs">{VALIDATION_LABEL[key]}</dt>
          <dd className="text-ink-100 flex items-center gap-1 text-xs">
            <StateMark state={validation[key]} />
            {VALIDATION_STATE_LABEL[validation[key]]}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function List({ title, items }: { title: string; items: readonly string[] }) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="text-ink-100 text-xs font-semibold">{title}</p>
      <ul className="text-ink-300 list-disc pl-4 text-xs">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

/** « Plus → Projet et progression » : toutes les phases, leur état réel, les
 * validations qui manquent, les priorités et l'historique. Lit la même source
 * (`about/roadmap.ts`) que la carte de l'accueil. */
export default function ProjectPage() {
  const summary = roadmapSummary()
  const history = parseChangelogHeadings(changelog)

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Projet et progression"
        description={`${APP_NAME} — état réel de chaque phase de la feuille de route.`}
      />

      <Section id="resume" title="En un coup d’œil">
        <p>
          <strong className="text-ink-100">{summary.done}</strong> phase(s) terminée(s)
          sur {summary.total}, <strong className="text-ink-100">{summary.partial}</strong>{' '}
          partiellement livrée(s)
          {summary.inProgress > 0 && <>, {summary.inProgress} en cours</>}
          {summary.todo > 0 && <>, {summary.todo} à faire</>}.
        </p>
        <p className="text-ink-500 text-xs">
          « Terminée » veut dire implémentée et couverte par des tests automatisés. Aucune
          phase n’est validée sur iPhone ou Android réels : les essais sur appareil sont
          listés comme manquants.
        </p>
        <p className="text-ink-500 text-xs">
          Légende : <StateMark state="yes" /> oui · <StateMark state="partial" />{' '}
          partielle · <StateMark state="no" /> non. « Validation navigateur » = tests E2E
          sous Chromium avec cartes et GPS simulés, pas un service réel.
        </p>
      </Section>

      <Section
        id="priorites"
        title="Priorités proposées"
        description="Tirées des manques ci-dessous ; à ajuster, ce n’est pas un calendrier."
      >
        <ul className="flex flex-col gap-3">
          {PRIORITIES.map((priority) => (
            <li key={priority.title} className="flex flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <Badge variant={priority.level === 'P1' ? 'danger' : 'neutral'}>
                  {priority.level}
                </Badge>
                <span className="text-ink-100 font-medium">{priority.title}</span>
                <span className="text-ink-500 text-xs">
                  phase{priority.phases.length > 1 ? 's' : ''}{' '}
                  {priority.phases.join(', ')}
                </span>
              </span>
              <span className="text-ink-300 text-xs">{priority.why}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="phases" title="Toutes les phases">
        <ul className="flex flex-col gap-2">
          {ROADMAP.map((item) => (
            <li key={item.phase}>
              <details className="border-surface-700 bg-surface-800/40 rounded-lg border">
                <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-2 px-3 py-2">
                  <span className="text-ink-100">
                    {item.phase}. {item.label}
                  </span>
                  <Badge variant={STATUS_VARIANT[item.status]}>
                    {PHASE_STATUS_LABEL[item.status]}
                  </Badge>
                </summary>
                <div className="flex flex-col gap-2 px-3 pb-3">
                  <p className="text-ink-300 text-xs">{item.objective}</p>
                  <List title="Livré" items={item.delivered} />
                  <List title="Travail restant" items={item.remaining} />
                  <List title="Validations manquantes" items={item.missingValidation} />
                  <ValidationRow validation={item.validation} />
                  {item.phase === 14 && (
                    <Link to="/assistant" className="text-brand-400 text-xs underline">
                      Ouvrir l’assistant
                    </Link>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="version" title="Version et historique">
        <p>
          Version <strong className="text-ink-100">{APP_VERSION}</strong>
          {APP_BUILD_DATE && <> · compilée le {formatDateFr(APP_BUILD_DATE)}</>}
        </p>
        <ul className="flex flex-col gap-1 text-xs">
          {history.map((entry) => (
            <li key={`${entry.title}${entry.date ?? ''}`}>
              {entry.date && <span className="text-ink-500">{entry.date} · </span>}
              {entry.title}
            </li>
          ))}
        </ul>
        <p className="text-ink-500 text-xs">
          Historique complet :{' '}
          <a
            className="underline"
            href={`${REPOSITORY_URL}/blob/main/CHANGELOG.md`}
            target="_blank"
            rel="noopener noreferrer"
          >
            CHANGELOG.md
          </a>{' '}
          et{' '}
          <a
            className="underline"
            href={`${REPOSITORY_URL}/blob/main/docs/ROADMAP_STATUS.md`}
            target="_blank"
            rel="noopener noreferrer"
          >
            docs/ROADMAP_STATUS.md
          </a>
          .
        </p>
      </Section>
    </div>
  )
}
