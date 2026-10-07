import { Link } from 'react-router-dom'
import { Badge, InfoSection as Section, PageHeader } from '@/components/ui'
import { APP_BUILD_DATE, APP_NAME, APP_VERSION } from '@/app/appInfo'
import { formatDateFr } from '@/features/backup/restoreLabels'
import { NETWORK_PROVIDERS } from '@/features/privacy/networkProviders'
import { UpdateSection } from '../components/UpdateSection'
import { DOC_LINKS, REPOSITORY_URL } from '../docLinks'
import { PHASE_STATUS_LABEL, ROADMAP, type PhaseStatus } from '../roadmap'

const STATUS_VARIANT: Record<PhaseStatus, 'success' | 'warning' | 'neutral'> = {
  done: 'success',
  partial: 'warning',
  'not-started': 'neutral',
}

/** Version, honest phase status, updates, data credits and documentation. */
export default function AboutPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="À propos"
        description={`${APP_NAME} — version, état du projet, mises à jour et sources.`}
      />

      <Section id="version" title="Application">
        <p>
          <strong className="text-ink-100">{APP_NAME}</strong> · version{' '}
          <strong className="text-ink-100">{APP_VERSION}</strong>
          {APP_BUILD_DATE && <> · compilée le {formatDateFr(APP_BUILD_DATE)}</>}
        </p>
        <p>
          Comptes, abonnements et paiement : non disponibles / reportés. Aucune fonction
          de cette version n’en dépend.
        </p>
      </Section>

      <Section
        id="phases"
        title="État du projet"
        description="Statut honnête de chaque phase de la feuille de route."
      >
        <ul className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {ROADMAP.map((item) => (
            <li key={item.phase} className="flex flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-ink-100">
                  {item.phase}. {item.label}
                </span>
                <Badge variant={STATUS_VARIANT[item.status]}>
                  {PHASE_STATUS_LABEL[item.status]}
                </Badge>
              </span>
              {item.note && <span className="text-ink-500 text-xs">{item.note}</span>}
            </li>
          ))}
        </ul>
        <p className="text-ink-500 text-xs">
          Les phases livrées sont couvertes par des tests automatisés ; les essais sur
          appareils réels (iPhone, Android) ne sont pas documentés comme faits. Détail
          dans{' '}
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

      <Section id="mise-a-jour" title="Mises à jour">
        <UpdateSection />
      </Section>

      <Section
        id="sources"
        title="Sources de données et crédits"
        description="Seulement les services réellement appelés par cette version."
      >
        <ul className="flex flex-col gap-2">
          {NETWORK_PROVIDERS.map((provider) => (
            <li key={provider.id}>
              <strong className="text-ink-100">{provider.name}</strong> —{' '}
              {provider.credit}
            </li>
          ))}
        </ul>
        <p>
          Les couches québécoises (état, limites, avertissements) sont décrites dans{' '}
          <a
            className="underline"
            href={`${REPOSITORY_URL}/blob/main/docs/SOURCES_QUEBEC.md`}
            target="_blank"
            rel="noopener noreferrer"
          >
            docs/SOURCES_QUEBEC.md
          </a>
          . Une frontière sur la carte ne prouve pas un droit de chasse.
        </p>
        <p>
          Quels renseignements sont envoyés à ces services : voir{' '}
          <Link to="/privacy#reseau" className="underline">
            Confidentialité
          </Link>
          .
        </p>
      </Section>

      <Section id="documentation" title="Documentation du dépôt">
        <ul className="flex flex-col gap-1">
          {DOC_LINKS.map((doc) => (
            <li key={doc.path}>
              <a
                className="inline-flex min-h-11 items-center underline"
                href={`${REPOSITORY_URL}/blob/main/${doc.path}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {doc.label}
              </a>
            </li>
          ))}
        </ul>
        <p className="text-ink-500 text-xs">
          Ces liens ouvrent GitHub dans un nouvel onglet ; l’application elle-même ne
          contacte pas GitHub en dehors du chargement de ses fichiers.
        </p>
      </Section>
    </div>
  )
}
