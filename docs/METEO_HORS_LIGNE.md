# Météo et vent hors ligne — « Télécharger pour ma sortie »

PR A du chantier « météo améliorée ». Cette PR ne change pas la mise en page
globale ni le correctif immersif de la PR 22 ; la PR B (page Météo, soleil et
heures de chasse) dépend de celle-ci.

## Ce qui existait

- `OpenMeteoWeatherProvider` (page Météo, 48 h) et `OpenMeteoWindProvider`
  (grille de vent 5 × 5, 5 jours) derrière des interfaces remplaçables.
- `windStore` : cache de la dernière grille (`settings`) utilisé seulement si la
  requête échoue, curseur d'heure partagé `selectedHourOffset`.
- Dexie (`field-terrain-intelligence`), sauvegarde/restauration, effacement.

## Choix techniques

- **Pas de seconde architecture météo.** Le fournisseur Open-Meteo existant gagne
  `fetchPointForecast` (prévision du lieu, valeurs nullables) ; la grille de vent
  réutilise `WindProvider` et le type `WindField`. Une seule source alimente la
  page Météo et l'analyse du vent.
- **Un téléchargement = prévision du lieu + grille de vent 5 × 5** (± 0,15°, environ
  33 × 22 km) centrée sur le lieu. Ce n'est pas un champ de vent couvrant un
  territoire ; l'interface nomme le lieu de référence.
- **Période** : 1, 2, 3 (défaut, 72 h), 5 ou 7 jours. Le fournisseur documente
  `forecast_days` de 1 à 16 ; au-delà de 7 jours la fiabilité du modèle chute,
  rien n'est promis.
- **Stockage** : table Dexie `savedForecasts` (version 7 de la base, ajout pur,
  aucune migration de données). Aucun repère, trace, journal ou photo n'est
  touché. La table n'est pas dans la sauvegarde (cache re-téléchargeable) mais
  est effacée par « tout supprimer ».
- **Champs enregistrés** : vent (vitesse, direction, rafales), température et
  ressenti, code météo, précipitations et probabilité, minima/maxima, lever et
  coucher, humidité, pression, UV, visibilité, nébulosité. Une valeur absente
  est `null`, jamais 0.
- **Métadonnées** : lieu et coordonnées, fournisseur, date de récupération (UTC),
  période (première et dernière heure reçues), fuseau du lieu, unités, version du
  format (`1`).

## Règles d'honnêteté

- « Complet » seulement si la prévision du lieu **et** la grille de vent sont
  arrivées, couvrent chaque jour demandé (≥ 23 h, changement d'heure accepté) et
  ont température, vitesse et direction à chaque heure. Les variables
  facultatives absentes (visibilité, UV…) ne bloquent pas.
- Un téléchargement complet n'est remplacé que par un complet. Un échec laisse
  l'ancien téléchargement intact et l'erreur est expliquée.
- « Anciennes » après 12 h (choix du projet, pas une règle du fournisseur).
- La couverture est évaluée dans le **fuseau du lieu**, pas celui du téléphone.
- L'analyse du vent n'utilise un téléchargement que si le lieu est dans sa zone
  **et** l'heure courante dans sa période. Sinon : « Aucune prévision enregistrée
  pour ce lieu et cette date » ou « période terminée ». Jamais de substitution.
- Une prévision enregistrée est étiquetée « Prévision enregistrée — pas une
  mesure en direct ».
- Direction : convention météorologique (d'où vient le vent). Les flèches et
  particules sont converties (+ 180°) par `describeWind`.
- Quota : estimation `navigator.storage.estimate()` (marge ×2) et erreur
  `QuotaExceededError` gérées ; 8 téléchargements au maximum.

## Limites connues

- Pas de recherche de lieu par nom (position, centre de carte ou repère
  seulement) : un géocodeur serait un nouveau fournisseur à justifier.
- Appels réels à Open-Meteo non validés depuis l'environnement de développement
  (réseau bloqué) : les noms de variables viennent de la documentation et sont
  couverts par des tests avec réponses simulées.
- Validation sur iPhone physique non réalisée.
