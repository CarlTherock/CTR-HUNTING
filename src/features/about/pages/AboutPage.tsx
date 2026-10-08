import { Link } from 'react-router-dom'
import { InfoSection as Section, PageHeader } from '@/components/ui'
import { APP_BUILD_DATE, APP_NAME, APP_VERSION } from '@/app/appInfo'
import { formatDateFr } from '@/features/backup/restoreLabels'
import { NETWORK_PROVIDERS } from '@/features/privacy/networkProviders'
import { UpdateSection } from '../components/UpdateSection'
import { DOC_LINKS, REPOSITORY_URL } from '../docLinks'

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
        <p>
          Toutes les phases, leur état réel, les validations manquantes et les priorités
          sont dans{' '}
          <Link to="/project" className="underline">
            Plus → Projet et progression
          </Link>
          . Les phases 14 (IA), 15 (synchronisation), 16 (tests sur appareils) et 17
          (version commerciale) ne sont pas terminées.
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
