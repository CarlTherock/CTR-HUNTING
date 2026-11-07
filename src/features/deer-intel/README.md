# features/deer-intel — « Où et quand chasser »

Module d'aide à la décision pour le cerf de Virginie. **Indice comparatif, pas un modèle biologique
validé.** Il fonctionne sans journal, sans observations et sans caméra de chasse.

## Contenu

Partie **QUAND** (moteur astronomique + créneaux) et partie **OÙ** (secteurs, points candidats), puis page `/hunt`.

### QUAND

- `rules/registry.ts` : registre versionné (`RULE_REGISTRY_VERSION`) de **toutes** les règles :
  actives, informatives, expérimentale, non prises en charge, avec source, niveau de lecture réel,
  population, limites de transfert et nature du coefficient. `BIBLIOGRAPHY` donne le niveau de
  lecture de R01–R19. Un test vérifie que les règles actives/expérimentales du registre sont
  exactement celles que le moteur exécute (`IMPLEMENTED_RULE_IDS`).
- `engine/` : calcul pur et déterministe (`analyzeHunt`).
  - `sunDay.ts`, `moon.ts` : soleil et lune du jour **local** du lieu (SunCalc, hors ligne). Les
    passages lunaires supérieur/inférieur sont cherchés par croisement d'azimut (SunCalc 2.x :
    degrés) ; le passage inférieur n'est pas « supérieur + 12 h » ; un événement absent reste `null`.
  - `activity.ts` : activité de référence = deux pics crépusculaires ancrés sur le lever/coucher
    locaux au-dessus d'un plancher non nul (jour et nuit). Hauteurs de pics = choix de conception.
  - `conditions.ts` : conditions de chasse (vent × poste/zone sensible renseignés, rafales,
    précipitations). Un facteur absent est « non évalué », jamais 0 ni 50.
  - `windows.ts` : indice (65 % activité + 35 % conditions), fenêtres à seuil **absolu**,
    robustesse (poids 0,5–0,8, seuil 50–60) → `stable`, `fragile`, `équivalent`, `unique`, `aucune`.
  - `solunar.ts` : hypothèse expérimentale opt-in (±6 points max), désactivée par défaut.

### OÙ (`spatial/`)

- `extent.ts` : étendue **ancrée** (point GPS + rayon 300–3000 m), indépendante du zoom et du déplacement de la carte.
- `services/landcover/OverpassLandCoverProvider.ts` : géométries d'occupation du sol OpenStreetMap (Overpass `out geom`). Une erreur réseau est propagée, jamais comblée.
- `grid.ts`, `habitat.ts` : grille (≤ 3600 cellules) ; règle `HAB-COVER-FOOD-01` = couvert forestier proche d'un milieu nourricier (heuristique D). Eau et bâti exclus ; cellule sans donnée = sans score ; couverture séparée du score.
- `sectors.ts` : composantes connexes au-dessus du seuil **absolu** 60, contours tracés (anneaux), classement.
- `candidates.ts` : ≤ 10 points, espacement ≥ 150 m, rangs absolus A ≥ 75, B ≥ 60, C ≥ 50, raisons et données manquantes ; création de repère par le flux existant (`startDraftAt`).
- **Corridors : jamais calculés** (aucune méthode documentée ; guide 2013 p. 30 et 33 non récupérés). Distingués de l'accès du chasseur et des traces enregistrées.

### Page `/hunt`, carte et hors ligne

- Onglets QUAND / OÙ / COMMENT / Sources ; graphique horaire SVG calculé (échelle 0–100 fixe), comparaison des jours, « Pourquoi ce créneau ? », paramètres (avancés repliés, avec retour aux valeurs par défaut).
- Entrées : « Où et quand chasser ici » dans l'analyse de la carte, hub « Plus », sidebar, route `/hunt?lat=&lng=`.
- `state/huntStore.ts` : calcul annulable ; une réponse d'un ancien calcul est ignorée (jeton). Prévision et occupation du sol en parallèle ; si l'une échoue, l'autre est conservée et l'avis est affiché ; si tout échoue, la dernière analyse enregistrée du même endroit est relue.
- Dexie **v8** (`huntAnalyses`, additive, sans `upgrade`) : point, étendue, période, versions du moteur et du registre, dates et sources des données, géométries. Cache recalculable : exclu de la sauvegarde d'archive, inclus dans l'effacement des données ; 30 analyses au plus (les plus anciennes seulement).
- Carte : `MapInstance.setHuntOverlay` (secteurs à transparence réglable, points A/B/C, cercle de l'étendue). La grille de potentiel existante reste la vue technique ; elle n'est pas modifiée.

## Règles actives, informatives, expérimentales

| Statut                   | Règles                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| Actives                  | ACT-CREPUSCULAR-01, ACT-BASELINE-01, CND-WIND-DIRECTION-01, CND-GUST-01, CND-PRECIP-01, IDX-COMBINE-01 |
| Expérimentale (opt-in)   | EXP-SOLUNAR-01                                                                                         |
| Informatives             | INF-MOON-01, INF-PRESSURE-01, INF-TEMP-01, INF-RUT-01, INF-SNOW-01                                     |
| Informatives (praticien) | PRAC-GAGNON-RUT-01, PRAC-GAGNON-THERMO-01, PRAC-GAGNON-NOCTURNES-01 (affichage, aucun score)           |
| Non prises en charge     | front confirmé, lux, enfoncement des sabots, appât, thermiques, clé hivernale du guide des ravages     |

**Aucun coefficient publié n'est utilisé.** Toutes les hauteurs de pics, pondérations et seuils sont des
heuristiques de conception (catégorie D).

## Niveau de lecture des sources (dossier V2, 2026-11-06)

Le registre s'appuie sur une **synthèse documentaire fournie** (dossier de références V2) : chaque
source porte un niveau d'accès (`corps_recupere`, `lecture_substantielle`, `partiel`,
`notice_seulement`, `non_lu`) et les passages cités. **Ce n'est pas une lecture intégrale** des
publications ni une validation du modèle ; les règles qualitatives sont sous réserve de
vérification sur le texte original.

- Sullivan 2016 : texte principal récupéré ; région Brosnan Forest, Caroline du Sud (p. 226) ; dates
  du résumé (2010–2012) et des méthodes (2009–2011, 23 août–23 novembre) conservées telles quelles.
- Goethlich : page de titre 2 mai 2019, copyright 2020 (mentions distinctes) ; **chapitre 2 non
  récupéré** → aucune règle de pression (INF-PRESSURE-01 reste informative).
- Guide des ravages 2013 : clé et tableau 6 (p. 19–20), corridors (p. 30), connectivité (p. 33)
  manquants → aucune couche hivernale ni corridor tiré du guide.
- Louis Gagnon : trois articles récupérés ; recommandation de praticien (catégorie C) distincte de
  la base scientifique, jamais présentée comme un « modèle Louis Gagnon » ni comme un coefficient.
- Webb : +20 % de mouvement moyen au rut, P = 0,07 (non significatif). Hunsaker : pas d'effet des
  variables de température examinées — pas toute la météo.

Documents indispensables encore manquants : Goethlich ch. 2 (p. 49–54, 59–62, 67–69, 71–79, 90,
111–116) pour toute règle de pression ou de vent quantitative ; guide des ravages 2013 (p. 11–21,
tableau 6, 3.6.2, 3.6.5) pour habitat hivernal et corridors.

## Validation (séparée)

- **Conformité aux règles implémentées** : tests unitaires (registre ↔ moteur, courbes, conditions).
- **Robustesse numérique** : fuseaux, heure d'été (23/25 h), minuit, événements lunaires absents, 359°/1°.
- **Validation scientifique** : aucune ; les tests du code ne prouvent pas la précision biologique.
- **Validation locale (Québec)** : absente. Pas de taux de réussite ni de probabilité de rencontre.

## Pondérations du moteur : heuristiques, pas un modèle biologique validé

- Le mélange **65 % / 35 %** entre l’activité de référence et les conditions, la **forme des pics crépusculaires**, les hauteurs de pics et les seuils de classement sont des **choix de conception** (voir `ACT-CREPUSCULAR-01`, `ACT-BASELINE-01`). Aucune étude citée ne les fournit.
- Les indices sont **comparatifs** (un créneau par rapport à un autre pour le même lieu et le même jour), jamais une probabilité de voir un cerf.
- Pression, température et lune ne modifient pas l’indice.
- Le calendrier du rut (`INF-RUT-01`, page `/rut`) est **informatif** : deux bandes de contexte séparées (Québec.ca : novembre–décembre ; Wisconsin, étude externe : 23 octobre–12 novembre), sans pic, sans courbe et sans multiplicateur sur le créneau.
- Le résumé des observations (`features/rut/observationsSummary.ts`) est descriptif : il ne déclenche aucune tendance et ne conclut pas à une hausse ou baisse d’activité.
- Registre 1.3.0 : la source Hunsaker utilisée par `INF-RUT-01` est marquée « résumé seulement » ; les sections méthodes/résultats citées par les versions antérieures n’ont pas pu être relues.
