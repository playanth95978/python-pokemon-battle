# Règles d'implémentation — Pokémon Battle

Ces instructions s'appliquent à tout ce dépôt et aux agents qui y interviennent.
Les demandes explicites de l'utilisateur priment sur ce document.

## Avant de modifier le code

- Lire le `README.md` et les fichiers concernés. Pour l'IA, lire aussi `docs/ai.md`.
- Vérifier `git status --short` et les différences utiles : des modifications de
  l'utilisateur peuvent être présentes. Ne pas les écraser ni les annuler.
- Relire un fichier juste avant une modification et travailler par changements ciblés.
- Conserver les contrats existants sauf évolution explicitement nécessaire à la tâche.
- Choisir une solution simple et continuer dans le périmètre demandé. Demander une
  clarification seulement si une ambiguïté bloque réellement l'implémentation.
- Répondre en français. Expliquer le résultat, les tests et les limites réelles.

## Architecture et dépendances

```text
src/pokemon_battle/
├── domain.py           Définitions immuables et état des combattants
├── engine.py           Résolution du combat et événements métier
├── damage.py           Formule pure des dégâts
├── types.py            Types et efficacité
├── application/        Cas d'usage et contrats de persistance
│   └── ai/             Décision IA, contexte, mémoire et orchestration
├── infrastructure/     Implémentations de stockage
├── mistral/            Adaptateurs du fournisseur et transport HTTP
└── api/                Contrats HTTP, contrôleurs et injection des dépendances
frontend/my-app/        React, TypeScript et présentation du combat
tests/                  Tests Python
```

- Le domaine n'importe ni FastAPI, Pydantic, SQLite, HTTPX, Mistral, ni React.
- L'application dépend du domaine et de contrats explicites. Elle ne construit pas
  directement un client HTTP ou une connexion SQLite.
- Les adaptateurs dépendent des contrats applicatifs. Le câblage se fait au point
  de composition, notamment `api/app.py`.
- Les contrôleurs valident les entrées, délèguent et traduisent les résultats et
  erreurs vers HTTP. Aucune formule de combat ni transaction métier dans une route.
- Utiliser des `Protocol` pour les dépendances interchangeables qui en ont besoin.
  Ne pas créer une interface et une implémentation pour chaque classe par principe.
- Préférer la composition. Pas de service de base générique, hiérarchie artificielle,
  singleton global mutable ou conteneur d'injection supplémentaire sans besoin établi.
- Nommer les fichiers comme leur responsabilité : `ai_battle_service.py` pour
  `AiBattleService`. Ne pas créer un paquet `domain/` qui masque `domain.py`.

## Python 3.12 et lisibilité

- Utiliser les annotations modernes : `list[T]`, `tuple[T, ...]`, `T | None`,
  `collections.abc.Callable`. Typer les signatures des fonctions ajoutées ou modifiées.
- Employer des dataclasses pour les données métier. Réserver Pydantic aux frontières
  de validation : HTTP, schémas d'outils et réponses externes.
- Les définitions `Species`, `Stats` et `Attack` restent immuables, avec
  `@dataclass(frozen=True, slots=True)`. `Fighter` porte séparément les PV et PP mutables.
- Une dataclass gelée ne rend pas une liste interne immuable : utiliser des tuples
  pour les collections de définitions ou d'instantanés qui doivent être figées.
- Préférer des structures typées aux dictionnaires métier sans contrat. Garder
  `dict[str, Any]` aux frontières JSON ou pour les données réellement ouvertes.
- Aucun argument par défaut mutable. Utiliser `field(default_factory=...)` si nécessaire.
- Une méthode doit avoir une responsabilité identifiable. Extraire les étapes quand
  validation, accès aux données, décision, sérialisation et mutation se mélangent.
- Les méthodes publiques orchestrent ; les méthodes privées portent des actions
  explicites, comme `_validate_command`, `_prepare_conversation` et `_reserve_decision`.
- Ne pas imposer un nombre arbitraire de lignes ni découper chaque expression en
  une méthode. Extraire une étape cohérente, pas une abstraction sans utilité.
- Préférer les retours anticipés à l'imbrication profonde. Éviter les ternaires imbriqués.
- Les commentaires expliquent les raisons, invariants ou contraintes de protocole.
  Ne pas paraphraser chaque instruction. Les docstrings précisent les contrats utiles.
- Les noms de code restent cohérents avec le projet, généralement anglais ;
  explications et messages destinés au joueur sont en français.

## Règles du moteur de combat

- Le moteur est synchrone et indépendant de l'infrastructure. Injecter le hasard
  via `RandomSource` ; aucun appel au hasard global dans les règles métier.
- Valider les deux choix avant toute mutation ou consommation de hasard.
- Préserver l'ordre documenté des tirages et des événements : vitesse, précision,
  dégâts, KO et fin du combat. Un KO empêche la riposte.
- PV, PP et dégâts ne deviennent jamais négatifs ; les dégâts enregistrés sont les
  PV réellement perdus. Un combat terminé refuse un nouveau tour.
- Le moteur et l'estimation utilisent la même formule pure `damage_for_roll`.
  Ne pas recopier la formule dans un outil, un contrôleur ou le frontend.
- Préserver les arrondis entiers et les modificateurs exacts avec `Fraction`.
  Ne pas remplacer les calculs métier par des flottants approximatifs.
- Une estimation ne modifie aucun combattant, PP, tour ou générateur aléatoire.
- Ne pas ajouter implicitement potions, statuts, priorités ou règles officielles
  absentes du moteur. Toute nouvelle mécanique doit être définie, implémentée et testée.

## Transactions, concurrence et idempotence

- La base et le moteur constituent la référence de l'état du combat.
- Aucune transaction de base ne reste ouverte pendant un appel réseau au LLM.
- Lire un instantané pour décider, puis revérifier le tour, les PP et la réservation
  dans la transaction de résolution. Un contexte IA ne permet pas de jouer un tour périmé.
- Valider ensemble l'état du combat, le reçu de tour, la session IA et le reçu de
  commande humaine. Une panne d'écriture ne doit pas produire un tour partiellement enregistré.
- Vérifier le reçu idempotent avant l'état actuel, y compris après un KO.
  Une même clé et une même commande rejouent la même réponse sans rappeler le LLM.
- Une même clé avec un autre contenu est un conflit. L'idempotence IA porte sur
  la demande humaine, pas sur une attaque adverse régénérée.
- Les protections concurrentes doivent fonctionner entre plusieurs workers :
  un verrou en mémoire seul ne suffit pas. Conserver les vérifications de propriétaire
  et d'expiration des réservations persistantes.
- Les évolutions de schéma ou d'instantané restent compatibles avec les données
  existantes. Pas de suppression/recréation de base pour contourner une migration.

## Async et ressources

- Utiliser un client HTTP asynchrone pour les appels réseau des routes `async`.
  Les opérations SQLite synchrones de l'orchestration IA passent par un worker.
- Ne pas partager une connexion SQLite entre des étapes séparées par un appel réseau.
- Réutiliser les clients HTTP selon leur durée de vie et les fermer à l'arrêt.
- Borner délais, requêtes modèle et appels d'outils. Une boucle agent ne tourne pas indéfiniment.
- Laisser remonter `asyncio.CancelledError`. Une annulation utilisateur ne doit pas
  être transformée en décision de secours. Libérer les réservations acquises.
- Utiliser une horloge monotone pour les durées ; une échéance persistée doit être
  comparable entre processus. Injecter l'horloge quand cela facilite les tests.

## Mistral, outils et mémoire

- Avant de changer le protocole fournisseur, vérifier la documentation officielle
  correspondant à l'API utilisée. Ne pas confondre Chat Completions et Conversations.
- Le LLM propose des appels ; le backend valide et exécute les outils autorisés.
  Aucun appel arbitraire à du Python, SQL, au shell ou au réseau à partir d'une sortie modèle.
- Réutiliser les schémas Pydantic de validation pour déclarer les outils.
  Interdire les champs supplémentaires ; valider les slots comme des entiers stricts.
- Avec Conversations, répondre aux `function.call` par des `function.result` portant
  le même `tool_call_id`. Conserver le dernier identifiant de conversation retourné.
- Ne pas renvoyer tout l'historique à chaque continuation. Transmettre les nouvelles
  entrées et conserver les résultats encore en attente, notamment celui de la sélection finale.
- Isoler conversation, observations et décision par combat et combattant IA.
  Recréer le `ToolsContext` à chaque décision à partir de l'état actuel.
- Ne jamais transmettre le choix humain du tour en cours ni les attaques adverses
  encore inconnues. L'historique tactique contient des événements déjà résolus.
- Borner la mémoire. La rotation actuelle conserve les trois derniers tours résolus.
  Un seuil observé de tokens déclenche la rotation suivante ; ce n'est pas une limite stricte.
- Une rotation ne supprime pas automatiquement les conversations chez le fournisseur.
  Ne pas annoncer de suppression, de mémoire infinie ou de coût nul sans preuve.
- Un choix légal mais mauvais reste autorisé pour ne pas masquer les erreurs stratégiques.
  Le moteur est seul responsable d'appliquer le tour.
- Le secours local doit être identifiable dans les résultats et métriques.
  Ne pas transformer une erreur de programmation en repli silencieux.

## Erreurs, secrets et observabilité

- Utiliser des exceptions explicites pour les erreurs métier ; traduire en HTTP
  à la frontière API. Éviter les `except Exception` qui masquent les défauts de code.
- Ne jamais lire ou afficher de secrets pour diagnostiquer : `.env`, clés API,
  en-têtes d'autorisation et paramètres privés. La configuration peut les charger
  normalement à l'exécution ; les tests utilisent exclusivement des valeurs factices.
- Ne pas journaliser les prompts complets, corps fournisseur ou raisonnements internes.
  Préférer événements structurés, identifiants métier, statuts, latence et compteurs.
- Mesurer seulement les tokens réellement communiqués. Une valeur absente n'est
  pas zéro ; distinguer consommation, cache éventuel et coût monétaire.

## Frontend

- FastAPI reste la référence des PV, PP, tours et vainqueur. React conserve la
  réponse serveur et l'état d'interface, sans recalculer le métier.
- Les appels API restent dans `api.ts` et les hooks, jamais dans les composants de présentation.
- Préserver le blocage immédiat des doubles soumissions, l'annulation des requêtes
  et la réutilisation de la clé après une réponse perdue.
- Les animations présentent les événements reçus ; elles ne décident pas de leurs effets.

## Tests et vérifications

- Ajouter des tests ciblés pour un comportement nouveau ou un correctif. Pour un
  refactoring pur, réutiliser les tests de comportement existants et vérifier les invariants.
- Utiliser pytest, des RNG/horloges injectés, des bases temporaires et
  `httpx.MockTransport`. Aucun appel Mistral réel dans les tests automatisés.
- Tester les résultats observables : état, événements, contrats HTTP et reprises.
  Pour les transactions, couvrir concurrence, conflit, annulation et rollback utile.
- Des noms de tests explicites en français, avec des attendus concrets.
  Ne pas affaiblir ou supprimer un test pour faire passer une modification.
- Pour les évaluations IA, distinguer simulation, réponse fournisseur, décision LLM,
  recours au secours et réussite stratégique. Conserver aussi les échecs dans le rapport.
- Ne pas figer le nombre courant de tests dans ces règles : il évolue avec le projet.

Depuis la racine du dépôt :

```powershell
.venv/Scripts/python.exe -m pytest -q
```

Depuis `frontend/my-app/`, si le frontend a changé :

```powershell
npm test
npm run build
```

Respecter le gestionnaire et le verrou de dépendances du projet. Les commandes
`ai_smoke` sans `--dry-run` appellent réellement Mistral : ne pas les lancer comme
une vérification automatique ordinaire.

## Livraison du changement

- Actualiser le README si le comportement produit ou les commandes changent,
  et `docs/ai.md` si le protocole ou l'orchestration IA change.
- Ne pas ajouter une dépendance ou un outil de formatage uniquement pour une
  modification locale. Réutiliser l'outillage installé ; proposer séparément une évolution globale.
- Git en lecture seule par défaut. Ne pas stage, commit, push, reset, clean,
  changer de branche ou modifier les changements de l'utilisateur sans demande explicite.
- Ne pas démarrer ou redémarrer un serveur ni lancer un appel fournisseur réel
  sans que cela fasse partie de la tâche demandée.
- Dans le compte rendu : préciser ce qui est fait, les vérifications exécutées
  et les limites restantes. Ne pas annoncer un test réel si seul un transport simulé a été utilisé.
