# Refonte : où est passée chaque fonction ?

Aucune fonction n'a été supprimée, aucune donnée ni coordonnée n'a été
modifiée, la base Dexie n'a pas changé de version (DeerTracker ajoute des
champs facultatifs aux observations existantes).

| Fonction                                 | Avant                                    | Après                                                                 |
| ---------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------- |
| Accueil                                  | Accueil terrain                          | Accueil (+ cartes « Sur le terrain » et « Projet et progression »)    |
| Points de repère, traces, territoires    | Barre / menu secondaire                  | Mes données › Repères, Traces, Territoires (même page, ancres)        |
| Recherche de sang                        | Outils de la carte, page Repères         | Outils › Recherche de sang ; Mes données ; carte « Sur le terrain »   |
| Caméra (aide visuelle, photos)           | Dans la recherche de sang et les repères | Inchangée là ; accès rapide : Journal et photos, recherche de sang    |
| Journal                                  | Menu                                     | Mes données › Journal et observations                                 |
| DeerTracker (nouveau)                    | —                                        | Mes données › DeerTracker                                             |
| Météo, radar, vent                       | Page Météo + outils de carte             | Météo (nouveau panneau Vent) ; radar et vent animé toujours en Outils |
| Potentiel / comparateur / analyse        | Menu, outils de carte                    | Plus › Analyse ; outils de carte inchangés                            |
| Soleil et lune                           | Menu                                     | Plus › Soleil et lune                                                 |
| Assistant (calculs, pas d'IA générative) | Menu                                     | Plus › Assistant (état « IA générative non activée » conservé)        |
| Phases / avancement                      | À propos                                 | Plus › Projet et progression (à propos y renvoie)                     |
| Réglages, aide, confidentialité          | Menu                                     | Plus › Réglages / Aide / Confidentialité / À propos                   |
| Sauvegarde ZIP, GPX                      | Réglages                                 | Inchangé (Réglages) ; DeerTracker inclus                              |
| 2D / 3D                                  | Outils › Mode d'affichage                | Rail droit de la carte : « 2D » « 3D »                                |
| Relief (exagération 1×–10×)              | Outils, à côté du 2D/3D                  | Rail droit, visible en 3D seulement, étiqueté « Relief »              |
| Zoom + / −                               | Boutons permanents sur la carte          | Outils › Zoom ; pincement, double-tape, clavier                       |
| Boussole / nord                          | Contrôle MapLibre                        | Conservée (zoom retiré du contrôle)                                   |
| Fonds de carte, superpositions           | Couches                                  | Couches (inchangé, note vers les autres couches)                      |
| Forêt, LiDAR, territoires (Québec)       | Panneau plein écran inférieur            | Outils › Couches du Québec : dans la carte, hauteur bornée, repliable |
| Erreur de couche                         | Message générique                        | Message typé + « Réessayer » (3 essais au plus)                       |
