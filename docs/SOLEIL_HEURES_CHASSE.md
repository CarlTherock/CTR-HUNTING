# Page Météo, soleil et heures de chasse

PR B du chantier « météo améliorée ». **Dépend de la PR A** (`docs/METEO_HORS_LIGNE.md`) :
la page lit les prévisions téléchargées et le curseur d'heure du vent.

## Page Météo

Ordre : en-tête (lieu, date, en ligne/hors ligne, dernière mise à jour avec
l'origine des données, « Télécharger pour ma sortie », actualiser) → jours
(pictogramme, minimum/maximum) → carte principale → « Soleil et heures de chasse »
→ prévisions horaires (heure sélectionnable) → détails → conditions actuelles
(existant) → vent (existant) → téléchargement → graphique avancé (existant).

- **Une seule source à la fois, toujours nommée** : prévision en ligne ; sinon la
  plus récente entre la dernière copie gardée sur l'appareil et un téléchargement
  fait **pour ce lieu** (≤ 10 km) dont la période atteint encore aujourd'hui.
  Autre lieu ou jours tous passés : « Aucune prévision enregistrée pour ce lieu et
  cette date » / « période terminée », jamais de substitution.
- Fournisseur et type réutilisés : `OpenMeteoWeatherProvider.fetchPointForecast`
  (même appel que le téléchargement) ; `weatherStore` gagne un cache `point` à côté
  du cache existant (carte d'accueil inchangée).
- Les valeurs absentes affichent « indisponible » (jamais 0). Les pictogrammes
  viennent du code WMO du fournisseur ; sans code : « Conditions indisponibles ».
- **Heure → analyse du vent** : toucher une heure déplace le curseur partagé
  (`windStore.selectedHourOffset`) sur l'index de cette heure dans la grille
  chargée. Si l'heure n'est pas dans la période du vent chargé, un message le dit
  et le curseur ne bouge pas.
- Mobile d'abord : zones tactiles ≥ 44 px, aucune barre horizontale (vérifié à
  390 × 844 et 1280 × 900), fond sombre et accents verts.

## Soleil

Calcul **hors ligne** avec SunCalc (déjà utilisé par la page Soleil et lune),
pour les coordonnées du lieu et la date choisie, lus dans le **fuseau du lieu**
(Intl / base IANA de la plateforme) et non celui du téléphone. Chaque instant est
choisi parmi les jours solaires voisins pour tomber sur la bonne date locale ;
l'heure d'été et les changements de date sont donc gérés. Pas de lever/coucher
(jour ou nuit polaire) : « indisponible », rien n'est inventé.

## Plage horaire de chasse

Trois choses distinctes à l'écran : le **soleil astronomique**, la **plage horaire
calculée** selon une règle, et l'**autorisation réelle** (que l'application ne
connaît pas). Le texte dit « Dans la plage horaire calculée », jamais « chasse
autorisée ».

- **Seule règle prise en charge : la règle générale du Québec** — de 30 minutes
  avant le lever du soleil à 30 minutes après son coucher.
- Source : Québec.ca, « Heures de chasse »
  (`https://www.quebec.ca/tourisme-loisirs-sport/activites-sportives-et-de-plein-air/chasse-sportive/regles-generales/heures-chasse`).
  Lue le 2026-11-02 dans sa version anglaise (« Hunting times », mise à jour le
  2026-01-16). La version française donnée comme point de départ n'a pas pu être
  ouverte depuis l'environnement de développement.
- Exceptions listées par la page et **non calculées** : dindon sauvage (30 min
  avant le lever jusqu'à midi), collet du lièvre et du lapin à queue blanche et
  chasse à la grenouille (pas de règle sur les heures), raton laveur avec chiens
  (zones 4 à 8, nuit sous conditions).
- La page ne précise pas de lieu de référence pour les heures de lever et de coucher
  (tables en heure normale de l'Est, GPS ou calculateur fédéral) : les valeurs de
  l'application peuvent différer de quelques minutes des tables officielles, qui
  prévalent.
- **Application automatique limitée** : la règle générale du Québec s'applique d'elle-même
  seulement si la personne est **localisée par GPS** et que sa position tombe dans le
  rectangle englobant du Québec (la carte l'indique et propose « Retirer la règle »).
  Ce rectangle ne prouve pas qu'un lieu frontalier est au Québec : la personne peut
  retirer la règle, et ce choix est mémorisé (réglage `off`). Un lieu choisi sur la
  carte (sans GPS) ou un téléchargement exige toujours « Je chasse au Québec ». Hors
  Québec ou sans règle : le soleil seul est affiché. La règle n'est jamais appliquée à un
  autre territoire.
- **Oiseaux migrateurs** : règles fédérales non vérifiées (aucune source officielle
  canadienne exploitable trouvée) — aucun profil créé.
- Source, date de vérification, résumé et exceptions restent accessibles dans la
  carte (« Source, règle et limites »). Un téléchargement météo ne met pas ces
  règles à jour : elles changent avec une version de l'application.
- Rappel affiché : saisons, zones, espèces, permis et restrictions se vérifient
  séparément.

## Limites

- Pas de choix d'espèce ni de pratique (donc pas de plage pour les exceptions).
- Validation sur iPhone physique non réalisée ; appels réels à Open-Meteo non
  validés depuis l'environnement de développement (réponses simulées).
