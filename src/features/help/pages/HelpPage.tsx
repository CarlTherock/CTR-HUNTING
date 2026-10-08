import { Link } from 'react-router-dom'
import { PlayCircle } from 'lucide-react'
import { Button, InfoSection as Section, PageHeader } from '@/components/ui'
import { IosInstallSteps } from '@/features/install/components/InstallPrompt'
import { HELP_TOPICS } from '../helpTopics'
import { useOnboardingStore } from '@/features/onboarding/state/onboardingStore'

/** Plain-language help. Everything here describes behaviour present in this
 * version; limits are stated as limits. */
export default function HelpPage() {
  const replay = useOnboardingStore((s) => s.replay)

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Aide"
        description="Comment utiliser l’application, et ses limites."
        actions={
          <Button size="sm" variant="secondary" onClick={replay}>
            <PlayCircle size={14} aria-hidden="true" />
            Revoir la présentation
          </Button>
        }
      />

      <nav aria-label="Sujets de l’aide" className="flex flex-wrap gap-x-4 gap-y-1">
        {HELP_TOPICS.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="text-ink-300 hover:text-ink-100 inline-flex min-h-11 items-center text-sm underline"
          >
            {label}
          </a>
        ))}
      </nav>

      <Section
        id="limites-gps"
        title="Limites du GPS, surtout sur iPhone"
        description="À lire avant de compter sur l’enregistrement d’une trace."
      >
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-ink-100">
              L’iPhone suspend le GPS quand l’écran se verrouille
            </strong>{' '}
            ou quand l’application passe en arrière-plan. Une trace s’arrête alors
            d’enregistrer, sans autre signe que des points manquants.
          </li>
          <li>
            <strong className="text-ink-100">
              Une application web (PWA) ne peut pas enregistrer en arrière-plan.
            </strong>{' '}
            L’installer sur l’écran d’accueil n’y change rien. Pendant un enregistrement,
            gardez l’application ouverte et l’écran allumé (l’application demande au
            téléphone de ne pas éteindre l’écran quand il le permet).
          </li>
          <li>
            La précision varie : sous couvert forestier, en vallée ou près d’un versant,
            l’erreur peut atteindre plusieurs dizaines de mètres. La précision (± en
            mètres) et l’ancienneté de la position sont affichées ; une position ancienne
            est signalée comme telle.
          </li>
          <li>
            La boussole de l’appareil est magnétique et doit être calibrée (bougez le
            téléphone en huit). Loin des masses métalliques, aimants et étuis magnétiques.
            L’application signale une boussole peu fiable et ne remplace jamais le cap par
            la direction du déplacement.
          </li>
          <li>
            Les permissions sont accordées <em>par site</em> : si vous refusez la position
            ou la caméra, il faut les réautoriser dans les réglages de Safari ou du
            navigateur pour ce site.
          </li>
          <li>
            Ne comptez pas sur ce seul outil pour votre sécurité : prévoyez une carte, une
            boussole et une batterie de secours.
          </li>
        </ul>
      </Section>

      <Section id="installer" title="Installer l’application">
        <p>
          <strong className="text-ink-100">iPhone / iPad.</strong> Il n’y a pas d’invite
          automatique :
        </p>
        <IosInstallSteps />
        <p>
          <strong className="text-ink-100">Android (Chrome, Edge…).</strong> Quand le
          navigateur juge l’application installable, l’accueil affiche un bouton «
          Installer ». Sinon, utilisez le menu du navigateur › « Installer l’application »
          ou « Ajouter à l’écran d’accueil ».
        </p>
        <p className="text-ink-500 text-xs">
          Installée, l’application s’ouvre en plein écran et démarre sans réseau (une fois
          ouverte une première fois en ligne). Les essais d’installation sur appareils
          réels restent à faire.
        </p>
      </Section>

      <Section id="navigation" title="S’orienter dans l’application">
        <p>
          Cinq entrées en bas de l’écran : <strong className="text-ink-100">Accueil</strong>,{' '}
          <strong className="text-ink-100">Carte</strong>,{' '}
          <strong className="text-ink-100">Mes données</strong> (repères, traces, recherches
          de sang, journal, DeerTracker), <strong className="text-ink-100">Météo</strong> et{' '}
          <strong className="text-ink-100">Plus</strong> (analyse, assistant, Projet et
          progression, réglages, aide). Rien n’a été supprimé : chaque fonction existante a
          gardé un emplacement.
        </p>
      </Section>

      <Section id="carte-3d" title="Carte : 2D/3D, relief et zoom">
        <p>
          À droite de la carte, « 2D » met la carte à plat et « 3D » l’incline avec le relief.
          En 3D, le réglage « Relief » (1× à 10×) exagère la <em>hauteur verticale</em> du
          terrain : ce n’est pas un zoom. Le zoom se fait en pinçant la carte, en la touchant
          deux fois, au clavier (+ / −) ou avec « Zoom » dans Outils. Les couches (fonds,
          superpositions) sont dans « Couches » ; la forêt, le LiDAR et les territoires dans
          Outils › « Couches du Québec ». Si une couche ne charge pas, un message dit pourquoi
          et propose « Réessayer » (trois essais au plus) ; la carte reste utilisable.
        </p>
      </Section>

      <Section id="vent" title="Lire le vent">
        <p>
          Page Météo › Vent : la boussole indique d’où vient le vent (flèche pleine), avec la
          vitesse en grand et les rafales en second. Chaque heure affiche une flèche vers la
          provenance. Le statut « favorable / défavorable » compare seulement le vent avec les
          secteurs que <em>vous</em> avez enregistrés sur un repère ; sans secteur, il est «
          non renseigné ». C’est une prévision de modèle (Open-Meteo), pas une mesure sur
          place, et aucune prévision de déplacement des animaux n’est faite.
        </p>
      </Section>

      <Section id="deertracker" title="DeerTracker">
        <p>
          Mes données › DeerTracker sert à consigner <em>vos</em> observations et indices
          (cerf vu, piste, grattage, frottis…), avec photos, notes, territoire et lien vers un
          repère ou une trace. Il ne localise aucun animal en direct et ne prédit pas leur
          présence. Le résumé (nombre, répartition par heure, types) est un simple calcul sur
          vos propres entrées. Les données restent sur l’appareil et font partie de la
          sauvegarde ZIP.
        </p>
      </Section>

      <Section id="waypoints" title="Points de repère">
        <p>
          Sur la carte, le bouton d’ajout de point de repère permet de toucher l’endroit
          voulu : la position s’affiche en pointillés, vous donnez un nom, une catégorie,
          des notes et des photos, puis vous enregistrez.
        </p>
        <p>
          <strong className="text-ink-100">
            Après « Enregistrer », la position est verrouillée.
          </strong>{' '}
          Elle ne peut plus être déplacée par erreur (ni en glissant, ni en modifiant le
          point). Pour la changer, supprimez le point et créez-en un nouveau. Le nom, les
          notes, la catégorie et le territoire restent modifiables.
        </p>
      </Section>

      <Section id="traces" title="Traces">
        <p>
          Le bouton d’enregistrement de la carte démarre une trace (pause et reprise
          possibles) ; la distance et la durée se mettent à jour avec les positions GPS.
          Les points trop proches du précédent sont ignorés pour ne pas compter le
          tremblement du GPS. La trace est écrite sur l’appareil au fur et à mesure.
        </p>
        <p>
          <strong className="text-ink-100">Trace interrompue.</strong> Si l’application
          est fermée ou l’écran verrouillé pendant l’enregistrement, la trace reste avec
          les points déjà reçus et apparaît comme « interrompue » dans Repères et traces.
          Vous pouvez la terminer là où elle s’arrête, ou la reprendre : la reprise ne
          relie pas le dernier point au suivant, la période non observée reste un trou
          dans la trace.
        </p>
        <p>
          <strong className="text-ink-100">Types et couleurs.</strong> Un trajet normal
          prend la couleur choisie avant de démarrer (Outils › Couleur du prochain
          trajet), modifiable ensuite depuis Repères et traces sans toucher aux points
          GPS. Le rouge est réservé aux recherches de sang. Les anciennes traces gardent
          leur aspect.
        </p>
      </Section>

      <Section id="recherche-de-sang" title="Recherche de sang">
        <p>
          Outils › « Démarrer une recherche de sang » enregistre <em>votre</em>{' '}
          déplacement en rouge (ce n’est pas le trajet de l’animal). Chaque appui sur « +
          Sang » crée un vrai point de repère (Sang 01, Sang 02…) à la position du
          téléphone, avec l’heure et la précision GPS. Sa position est verrouillée à
          l’enregistrement ; le nom, la note et les photos restent modifiables. Le numéro
          d’un point supprimé n’est jamais réutilisé.
        </p>
        <p>
          Pause, reprise et fin sont dans le panneau. « Revenir au dernier sang » et «
          Aller au dernier indice » utilisent Aller à (distance et cap à vol d’oiseau, pas
          un itinéraire). Sans signal GPS récent, vous pouvez attendre ou placer le point
          à la main (la position choisie n’est pas celle du téléphone). La « liaison entre
          indices » est une aide visuelle, pas le trajet de l’animal.
        </p>
        <p>
          Si l’application est fermée en cours de route, la recherche et ses points sont
          conservés ; vous pourrez la reprendre ou la terminer. Sur iPhone, le GPS
          s’arrête quand l’écran se verrouille : gardez l’application ouverte.
        </p>
        <p>
          <strong className="text-ink-100">Aide visuelle expérimentale (caméra).</strong>{' '}
          Elle surligne des zones de couleur ; ce ne sont pas du sang confirmé et son
          absence ne prouve rien. L’application ne pose aucun diagnostic de blessure à
          partir d’une couleur, ne donne aucun délai universel avant de reprendre la
          recherche et ne remplace ni une aide qualifiée ni un conducteur de chien de
          sang. Sauvegarde : les recherches, couleurs et compteurs sont dans la sauvegarde
          complète ; le fichier GPX garde les segments, le type et la couleur des traces
          mais pas les sessions.
        </p>
      </Section>

      <Section id="guidage" title="Aller à et boussole">
        <p>
          Depuis un point de repère, « Aller à » affiche une flèche, la distance à vol
          d’oiseau et le cap vers ce point. Ce n’est pas un itinéraire : il n’y a ni
          sentier ni route calculés, et le terrain peut obliger à contourner. Le guidage
          s’arrête si vous l’arrêtez, si le point est supprimé ou si l’application est
          rechargée ; l’accueil permet de le reprendre ou de l’arrêter.
        </p>
        <p>
          Il faut une position GPS récente. La boussole demande, sur iPhone, un toucher
          sur « Activer la boussole » ; si elle est absente ou peu fiable, l’application
          le dit au lieu d’inventer un cap.
        </p>
      </Section>

      <Section id="hors-ligne" title="Cartes hors ligne">
        <p>
          Depuis la carte, cadrez une zone et téléchargez-la : l’application enregistre
          les tuiles du fond de carte <em>actif</em> pour les niveaux de zoom choisis.
          Chaque zone est liée à un seul fond de carte.
        </p>
        <p>
          <strong className="text-ink-100">« Terminée »</strong> signifie que toutes les
          requêtes du balayage ont réussi. Ce n’est <em>pas</em> une garantie de
          couverture géographique complète, tuile par tuile. Les couches superposées
          (météo, couches québécoises) ne sont pas incluses, sauf celles visibles au
          moment du téléchargement, et l’imagerie météo n’est jamais enregistrée.
        </p>
        <p>
          <strong className="text-ink-100">« Réessayer »</strong> (Réglages › Cartes hors
          ligne) apparaît pour une zone incomplète, interrompue ou en échec : elle ouvre
          la carte et reprend sur la même zone, en ne retéléchargeant que ce qui manque.
          Le fond de carte de la zone doit être celui affiché.
        </p>
      </Section>

      <Section id="territoires" title="Territoires">
        <p>
          Un territoire est un simple dossier (un nom et des notes) pour classer points,
          traces et entrées de journal. Il n’a pas de limites géographiques. Le filtre
          choisi masque le reste dans les listes et sur la carte ; un avis indique combien
          d’éléments sont masqués. Les éléments créés pendant qu’un territoire est
          sélectionné y sont rangés. Supprimer un territoire déplace son contenu dans «
          Non classé » ; rien n’est effacé.
        </p>
      </Section>

      <Section id="sauvegarde" title="Sauvegarde et restauration">
        <p>
          Vos données ne sont que sur cet appareil. Dans{' '}
          <Link to="/settings#donnees-et-sauvegarde" className="underline">
            Réglages › Données et sauvegarde
          </Link>
          , « Sauvegarder maintenant » crée un fichier .zip (points, traces, journal,
          photos, territoires) à garder ailleurs : iCloud Drive, ordinateur, courriel à
          vous-même. Les tuiles des cartes hors ligne n’y sont pas incluses.
        </p>
        <p>
          « Restaurer » lit d’abord le fichier et montre un aperçu sans rien écrire ; vous
          choisissez comment traiter les doublons. L’export et l’import GPX sont aussi
          proposés. Sur iPhone, le téléchargement direct peut être ignoré par
          l’application installée : utilisez le bouton de partage / « Enregistrer dans
          Fichiers ».
        </p>
      </Section>

      <Section id="mesures" title="Mesures">
        <p>
          Dans les outils de la carte, « Mesurer une distance » ou « une surface » :
          touchez les points un à un. La distance donne la longueur du parcours et la
          distance à vol d’oiseau ; la longueur en 3D n’apparaît que si l’altitude est
          connue pour tous les points. La surface est calculée sur la sphère, pas sur
          l’écran, et signale un polygone croisé. Les mesures sont temporaires : elles ne
          sont pas enregistrées.
        </p>
      </Section>

      <Section id="potentiel" title="Carte de potentiel">
        <p>
          La carte d’analyse colore la zone selon des indices calculés à partir de données
          réelles (terrain, couverture du sol, météo, vent, moment, vos observations).
          <strong className="text-ink-100">
            {' '}
            Un indice n’est pas une probabilité
          </strong>{' '}
          de présence ou de déplacement du gibier : c’est un repère pour comparer des
          endroits, avec les facteurs qui l’expliquent. Quand une donnée manque, le
          facteur est exclu, pas remplacé par une valeur inventée.
        </p>
      </Section>

      <Section id="permissions" title="Permissions">
        <p>
          L’application ne demande rien au lancement ni pendant la présentation. Le
          navigateur demande :
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            la <strong className="text-ink-100">position</strong> quand vous ouvrez une
            page qui l’utilise (carte, météo, soleil et lune, journal) ;
          </li>
          <li>
            la <strong className="text-ink-100">boussole</strong> (iPhone) quand vous
            touchez le bouton prévu ;
          </li>
          <li>
            la <strong className="text-ink-100">caméra</strong> quand vous ouvrez la
            caméra intégrée.
          </li>
        </ul>
        <p>
          Refuser une permission désactive seulement la fonction concernée. Détails :{' '}
          <Link to="/privacy#permissions" className="underline">
            Confidentialité
          </Link>
          .
        </p>
      </Section>
    </div>
  )
}
