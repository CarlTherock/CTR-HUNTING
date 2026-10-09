# Vérification iPhone — PR 17 (+ Repère, caméra sang, Après le tir)

**Statut : jamais exécutée.** Tout ce qui a été vérifié jusqu'ici l'a été dans
Chromium avec carte, GPS et caméra **simulés**. Cela ne vaut pas validation iPhone.
Cette liste est faite pour être cochée sur un vrai appareil, quand vous aurez le temps.

> **Données fictives seulement.** N'utilisez aucune vraie donnée de chasse pour ces
> essais. Faites une sauvegarde ZIP de votre app habituelle avant de tester une
> version d'essai (une autre adresse = un stockage local séparé).
>
> Comment ouvrir la version à tester : voir `docs/TEST_IPHONE.md`. Rien n'a été
> déployé ni fusionné pour cela.

Faites la liste **deux fois** : (A) dans Safari, (B) dans l'app installée sur l'écran
d'accueil (Partager → Sur l'écran d'accueil). Notez l'iPhone, la version d'iOS et le
résultat à côté de chaque case. Écrivez « échec » avec ce que vous avez vu, sans
interpréter.

| Case             | A. Safari | B. App installée |
| ---------------- | --------- | ---------------- |
| Appareil / iOS : |           |                  |

## 1. Appui long sur la carte

- [ ] Carte ouverte, GPS autorisé. Poser le doigt ~1 s sur un endroit vide sans bouger : le panneau « Ajouter à la carte » s'ouvre.
- [ ] Le panneau indique bien le point touché (« Point pressé… »), pas votre position GPS.
- [ ] Lever le doigt : le panneau **reste ouvert** (il ne se referme pas tout seul).
- [ ] Un toucher bref sur la carte n'ouvre rien.
- [ ] Un glissement (déplacer la carte) n'ouvre rien.
- [ ] Aucun menu de loupe, de sélection de texte ou de copie d'iOS n'apparaît par-dessus.
- [ ] Créer un repère de ce point : il apparaît à l'endroit touché.

## 2. Caméra sang : permission, refus, nouvelle autorisation

- [ ] Sans recherche ouverte : Outils → Caméra sang (ou « + Repère » → Caméra sang). Elle s'ouvre sans exiger de recherche.
- [ ] iOS demande l'accès à la caméra : **Refuser**. L'écran affiche un message clair et reste utilisable (bouton pour fermer, pas d'écran noir bloqué).
- [ ] Fermer, puis rouvrir la caméra : le message de refus s'affiche encore, sans plantage.
- [ ] Réglages d'iOS → Safari (ou l'app installée) → Caméra : passer à « Demander » ou « Autoriser ». Revenir dans l'app, rouvrir la caméra : l'image apparaît.
- [ ] L'image est fluide et s'affiche dans le bon sens en portrait.
- [ ] Mettre l'app en arrière-plan quelques secondes puis revenir : la caméra reprend ou propose de la rouvrir (pas d'image figée sans message).
- [ ] Fermer la caméra : le voyant de caméra d'iOS (point vert) s'éteint.
- [ ] Le texte rappelle que l'aide est expérimentale, avec des faux positifs possibles, et qu'elle ne confirme jamais du sang.

## 3. Clavier sur les champs du panneau

- [ ] « + Repère » → Observation cerf : toucher « Nombre ». Le clavier numérique s'ouvre ; le champ et le bouton d'enregistrement restent visibles ou atteignables en défilant.
- [ ] Toucher « Note » : le clavier s'ouvre sans cacher le champ ; le texte saisi est conservé.
- [ ] Fermer le clavier (Terminé / toucher ailleurs) : la mise en page revient normale, sans bande vide ni zoom resté bloqué.
- [ ] Repère normal → Continuer : toucher « Nom » dans la fiche. Le clavier n'enferme pas les boutons Enregistrer / Annuler.
- [ ] Le texte des champs est assez grand pour qu'iOS ne zoome pas la page à la saisie.

## 4. Rotation avec le panneau ouvert

- [ ] « + Repère » ouvert en portrait : tourner l'iPhone en paysage. Les 5 types sont visibles **sans défilement** et le bouton d'action est visible.
- [ ] Tourner de nouveau en portrait : le type choisi est conservé.
- [ ] Fiche d'un repère ouverte puis **repliée** (flèche) : tourner l'iPhone ; elle reste repliée, puis dépliée si vous la dépliez, dans les deux orientations.
- [ ] « Aller à » actif + fiche d'un repère ouverte : « Arrêter le guidage » reste visible et touchable, en portrait et en paysage.
- [ ] Recherche de sang active : en paysage, « + Sang », « Caméra sang », « Dernier indice », « Pause » et « Terminer » restent atteignables.
- [ ] Rien ne dépasse de l'écran et aucune barre de défilement horizontale n'apparaît. Encoche et barre d'accueil ne masquent aucun bouton.

## 5. Mode hors ligne

Préparation (avec réseau) : ouvrir l'app, afficher la carte, attendre le chargement,
puis fermer et rouvrir l'app une fois.

- [ ] Mode avion activé (Wi-Fi et données coupés). Rouvrir l'app : elle démarre, le bandeau « Hors ligne » apparaît.
- [ ] Créer un repère normal à la position GPS (ou sur la carte) : il est enregistré.
- [ ] Démarrer une recherche de sang, ajouter un indice : enregistré sans réseau.
- [ ] Observation cerf ou orignal : enregistrée sans réseau.
- [ ] Fermer complètement l'app, la rouvrir toujours hors ligne : repères, indices et observations sont encore là.
- [ ] Les fonds de carte non visités avant ne s'affichent pas : c'est attendu (aucune zone hors ligne n'est promise ici). Noter si l'app l'indique clairement.
- [ ] Désactiver le mode avion : l'app revient en ligne sans perdre les données saisies.
- [ ] Le GPS fonctionne-t-il hors ligne ? Noter la précision affichée et l'âge de la position.

## 6. Espace « Après le tir »

- [ ] L'espace s'ouvre. Chaque section du guide affiche « Contenu à venir — sources en vérification » : aucun conseil de chasse n'est donné.
- [ ] Consigner un tir fictif (espèce, réaction) : enregistré avec la position GPS, sans estimation d'animal inventée.

## À me rapporter

Pour chaque « échec » : l'appareil, la version d'iOS, Safari ou app installée, l'étape
numérotée, et une capture d'écran si possible. Ce qui n'a pas pu être testé doit être
indiqué comme « non testé », pas comme « réussi ».
