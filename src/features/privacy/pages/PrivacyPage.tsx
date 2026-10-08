import { Link } from 'react-router-dom'
import { InfoSection as Section, PageHeader } from '@/components/ui'
import { DataDeletionSection } from '../components/DataDeletionSection'
import { NETWORK_PROVIDERS, displayHost } from '../networkProviders'

/**
 * Privacy, as the code really behaves. The list of outside services comes
 * from `networkProviders.ts`, which a test keeps in step with the
 * Content-Security-Policy allow-list. This is a technical description, not
 * legal advice, and it claims no compliance with any law.
 */
export default function PrivacyPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Confidentialité"
        description="Ce que l’application garde, ce qu’elle envoie, et comment tout supprimer."
      />

      <p
        role="note"
        className="border-surface-600 bg-surface-900 text-ink-300 rounded-lg border p-3 text-sm"
      >
        Ce texte décrit le fonctionnement technique de l’application. Ce n’est pas un avis
        juridique, et il n’affirme la conformité à aucune loi ni à aucun règlement.
      </p>

      <Section
        id="aucun-compte"
        title="Aucun compte, aucun pistage"
        description="Vérifié dans le code de cette version."
      >
        <ul className="list-disc space-y-1 pl-5">
          <li>Il n’y a pas de compte, d’identifiant d’utilisateur ni de connexion.</li>
          <li>
            Il n’y a aucun outil d’analyse ou de statistiques d’usage, aucune publicité,
            aucun suivi d’activité. L’application ne pose pas de témoin (cookie).
          </li>
          <li>
            Il n’y a pas de serveur propre à l’application : elle ne reçoit rien de ce que
            vous faites.
          </li>
          <li>
            Comptes, abonnements et paiement : non disponibles (reportés à une version
            ultérieure).
          </li>
        </ul>
      </Section>

      <Section
        id="donnees-locales"
        title="Ce qui est stocké sur votre appareil"
        description="Dans le stockage du navigateur de cet appareil, nulle part ailleurs."
      >
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Base locale (IndexedDB) : vos points de repère, traces, entrées de journal,
            photos, territoires, la description de vos zones de carte hors ligne, vos
            réglages et la dernière prévision météo consultée.
          </li>
          <li>
            Stockage de cache du navigateur : les tuiles et ressources des cartes
            téléchargées, ainsi que les fichiers de l’application pour qu’elle démarre
            sans réseau.
          </li>
        </ul>
        <p>
          Effacer les données du site dans le navigateur, ou une libération d’espace par
          le téléphone, supprime ces données. Une{' '}
          <Link to="/settings#donnees-et-sauvegarde" className="underline">
            sauvegarde en fichier
          </Link>{' '}
          est la seule protection.
        </p>
      </Section>

      <Section
        id="reseau"
        title="Ce qui est envoyé sur le réseau"
        description="Seulement vers les services ci-dessous, et seulement quand la fonction correspondante est utilisée."
      >
        <p>
          Toute requête révèle au service contacté votre adresse IP, le type de navigateur
          et l’heure ; ce que ce service en fait relève de ses propres conditions, que
          l’application ne contrôle pas. L’application elle-même est servie par GitHub
          Pages, qui voit de la même façon les chargements de ses fichiers.
        </p>
        <ul className="flex flex-col gap-3">
          {NETWORK_PROVIDERS.map((provider) => (
            <li
              key={provider.id}
              className="border-surface-700 flex flex-col gap-1 rounded-lg border p-3"
            >
              <h3 className="text-ink-100 font-medium">{provider.name}</h3>
              <p className="text-ink-500 text-xs break-all">
                {provider.hosts.map(displayHost).join(' · ')}
              </p>
              <p>
                <strong className="text-ink-100">Pourquoi :</strong> {provider.purpose}
              </p>
              <p>
                <strong className="text-ink-100">Ce qui est envoyé :</strong>{' '}
                {provider.sent}
              </p>
              <p>
                <strong className="text-ink-100">Quand :</strong> {provider.when}
              </p>
            </li>
          ))}
        </ul>
        <p>
          Les crédits et licences de ces sources sont listés dans{' '}
          <Link to="/about#sources" className="underline">
            À propos
          </Link>
          .
        </p>
      </Section>

      <Section id="non-transmis" title="Ce qui n’est jamais envoyé">
        <ul className="list-disc space-y-1 pl-5">
          <li>Vos notes, vos photos et le contenu de votre journal.</li>
          <li>Les noms, notes et catégories de vos points de repère.</li>
          <li>Vos traces enregistrées et vos territoires.</li>
          <li>Vos sauvegardes : ce sont des fichiers que vous seul déplacez.</li>
        </ul>
        <p>
          Précision : les services de cartes et de météo reçoivent la zone ou le lieu dont
          vous demandez la carte ou les données (voir ci-dessus). Quand la météo ou une
          analyse est demandée pour votre position GPS, ces coordonnées sont envoyées à
          Open-Meteo ou à Overpass. Les fournisseurs de cartes ne reçoivent que les tuiles
          de la zone affichée, qui peut être centrée sur vous.
        </p>
        <p>
          Le partage d’un point crée un texte et un lien (coordonnées et nom du point
          seulement) que vous choisissez d’envoyer vous-même. L’application ne contacte
          pas le service de cartes du lien : c’est à vous de l’ouvrir.
        </p>
      </Section>

      <Section
        id="permissions"
        title="Permissions de l’appareil"
        description="Demandées par le navigateur au moment où vous utilisez la fonction."
      >
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Position : lire où vous êtes sur la carte, enregistrer une trace, guider.
          </li>
          <li>Boussole (iPhone) : après un toucher sur le bouton prévu.</li>
          <li>Caméra : à l’ouverture de la caméra intégrée.</li>
        </ul>
        <p>
          Chaque permission se retire dans les réglages du navigateur ou du téléphone, par
          site. Ces lectures restent sur l’appareil.
        </p>
      </Section>

      <Section
        id="gerer"
        title="Gérer vos données"
        description="Exporter ou supprimer. Rien n’est supprimé sans votre confirmation."
      >
        <p>
          <strong className="text-ink-100">Exporter :</strong> la sauvegarde complète et
          l’export GPX se trouvent dans{' '}
          <Link to="/settings#donnees-et-sauvegarde" className="underline">
            Réglages › Données et sauvegarde
          </Link>
          .
        </p>
        <p>
          <strong className="text-ink-100">Supprimer :</strong> efface de cet appareil
          toutes les données listées plus haut, en deux étapes. Cela ne retire pas ce que
          des services extérieurs ont pu recevoir, ni vos fichiers de sauvegarde ou
          partages existants.
        </p>
        <DataDeletionSection />
      </Section>
    </div>
  )
}
