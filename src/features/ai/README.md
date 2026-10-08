# features/ai — assistant « utile et traçable » (phase 14)

**État : fonctions déterministes livrées. IA générative NON activée.**
Rien dans ce dossier n'appelle un réseau, une clé ou un fournisseur payant.
Tout résultat est un calcul sur vos enregistrements locaux, étiqueté
« Calcul / résumé automatique ». L'étiquette « interprétation IA » existe dans
le vocabulaire mais n'est jamais produite ici.

## Couches

UI (`pages/`, `components/`) -> état (`state/`) -> logique pure (ce dossier)
-> magasins et services existants (jamais de lecture directe de la base).

| Fichier                                     | Rôle                                                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `explain.ts`, `explainSources.ts`           | Expliquer une cellule ou une analyse déjà calculée (facteurs, poids, sources, manques, écart).     |
| `cacheComparison.ts`                        | Mettre en forme un `CacheComparison` existant, sans le recalculer.                                 |
| `territorySummary.ts`                       | Résumé d'un territoire : comptes, traces, journal, photos, période, derniers éléments.             |
| `historySearch.ts`                          | Recherche (texte, type, catégorie, période, territoire, proximité, photo, vent enregistré).        |
| `periods.ts`                                | Comparaison de deux périodes; moins de 3 éléments par période = « données insuffisantes ».         |
| `types.ts`, `nature.ts`, `resultBuilder.ts` | `AssistantContext`, `AssistantResult`, natures d'énoncé, constructeur qui garantit la traçabilité. |
| `text.ts`, `chunking.ts`                    | Nettoyage de texte (données inertes), découpage en tranches annulables.                            |
| `prompt.ts`, `provider.ts`                  | Enveloppe de requête, `AssistantProvider`, `NullAssistantProvider`, minimisation, consentement.    |
| `validate.ts`, `links.ts`                   | Contrôle de traçabilité; ouverture des éléments cités (lecture seule).                             |

## Traçabilité

Chaque énoncé porte une nature : `fait enregistré`, `calcul`, `estimation`
ou `interprétation IA` (jamais pour du déterministe). Chaque identifiant cité
est un bouton qui ouvre l'élément (fiche, entrée de journal, liste des traces,
cellule sur la carte). `AssistantContext` liste ce qui a été consulté (plafond
de 200, total exact), les facteurs et les données manquantes. Les notes sont
des données : nettoyées, tronquées, échappées, jamais exécutées ni suivies comme
consigne. `findTraceabilityProblems` vérifie ces règles dans les tests.

## Construction de la requête (non utilisée tant qu'aucun fournisseur n'existe)

`buildPromptEnvelope(request)` produit un texte système constant et les
données dans `<donnees_utilisateur>…</donnees_utilisateur>`, JSON échappé (une
balise de fermeture ou une consigne dans une note reste du texte).
`minimizeContext` retire par défaut coordonnées, noms, notes et photos;
chaque catégorie doit être cochée et l'aperçu relu (`ConsentPreview`, rien
n'est envoyé). `requestGeneration` refuse sans `acknowledged` et n'appelle
jamais un fournisseur indisponible.

## Ce qui manque pour une IA générative

1. Point d'accès serveur sécurisé gardant la clé côté serveur.
2. Authentification des appareils et limites de débit.
3. Décision de fournisseur et de coût.
4. Politique de confidentialité et de conservation (positions sensibles).
5. Consentement explicite (parcours prêt, inactif).

## Performance

Page importée à la demande (route lazy). Calculs longs découpés en tranches
avec budget de temps, annulés quand une nouvelle demande les remplace
(`useAssistantTask`), résultats mémoïsés.

## Tests

`npx vitest run src/features/ai` (un fichier par fonction, plus traçabilité,
notes hostiles, consentement, composants, page, intégration) et
`e2e/assistant.spec.ts` (Playwright; non exécuté dans l'environnement de
développement automatisé faute de navigateurs).
