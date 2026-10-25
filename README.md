# Pokémon battle domain

Les positions d'attaque utilisent désormais le nom `attack_slot` dans le domaine,
les réponses HTTP, les outils IA et React : `AttackAction(attack_slot=0)`.
Les actions sauvegardées s'écrivent `{"action_type": "attack", "attack_slot": 0}`
ou `{"action_type": "potion"}`. La lecture reste compatible avec les anciens noms
`kind`/`slot` et les anciens reçus contenant seulement des indices d'attaque.
Les colonnes historiques SQLite sont conservées ; les actions JSON des nouveaux
reçus font référence. La valeur technique -1 dans une colonne historique indique
une action non offensive et n'est jamais utilisée pour résoudre le tour.
Recharger le frontend et relancer le backend ensemble après cette évolution de contrat.
Les routes de tour acceptent les actions complètes, ainsi que les anciens indices
`first_move`, `second_move` ou `player_move` pour les attaques.

Dans l'arène, sélectionner **Utiliser une potion**, puis **Jouer le tour**.
Chaque combattant dispose de deux potions qui rendent au plus 20 PV. Une potion
remplace l'attaque et agit avant les attaques ; son bouton est désactivé à pleine
santé, sans stock ou pendant une requête. Le stock et le soin affichés viennent
du serveur. En mode IA, le joueur peut se soigner pendant que Mistral choisit son
attaque ; la décision IA n'a pas accès au choix du joueur en cours.

Exemple de corps pour `POST /battles/{id}/turns` :

```json
{
  "first_action": {"action_type": "potion"},
  "second_action": {"action_type": "attack", "attack_slot": 0},
  "expected_turn": 0,
  "idempotency_key": "00000000-0000-0000-0000-000000000001"
}
```

Sur `/ai-turns`, envoyer `player_action` à la place des deux actions. Les réponses
incluent `potions` pour chaque combattant et l'événement `potion_used` avec le soin
réel et le stock restant. Les commandes mixtes anciens/nouveaux champs sont refusées.

Python 3.12+ domain package, independent of the API, storage and React frontend.
Species, stats and attack definitions are frozen dataclasses; each `Fighter` owns its
mutable HP and PP. Species stats are the fighter's effective stats (no EV/IV calculation).

```python
from random import Random
from pokemon_battle import Attack, Battle, BattleEngine, Fighter, Species, Stats, Type

tackle = Attack("Tackle", Type.NORMAL, power=40, accuracy=100, max_pp=35)
species = Species("Example", (Type.NORMAL,), Stats(120, 65, 60, 50, 55, 70), (tackle,))
battle = Battle(Fighter("player", species), Fighter("opponent", species))
events = BattleEngine(Random(42)).play_turn(battle, first_move=0, second_move=0)
```

Each turn accepts two zero-based attack slots and validates both before changing state.
Higher speed acts first; ties draw an integer in `[0, 1]` (0: first fighter).
Each attempted attack consumes one PP, then draws accuracy in `[1, 100]` (inclusive).
Hits against nonimmune targets draw a damage percentage in `[85, 100]`.
An injected object implementing `randint(a, b)` controls every random decision.

Damage uses the level/power/attack/defense base formula, physical or special stats,
1.5× same-type bonus, the complete modern 18-type chart, and the damage roll.
Base divisions round down; combined modifiers round down once, with a minimum of one
damage except for immunities. This is a documented simplified ruleset, not a full
generation-specific Pokémon simulator. Potions provide the documented healing action
with priority over attacks. No critical hits, attack priority, status conditions,
abilities, switching, other items, or automatic Struggle. Exhausted moves are rejected.

Events are immutable typed dataclasses returned in execution order: attack used,
miss or damage, then KO and battle ended if applicable. Damage records actual HP lost.
A KO prevents retaliation. Finished battles reject further turns. The caller owns
the battle state and must serialize access; direct external state mutation is not guarded.

Install and test with Python 3.12 or newer:

```sh
python -m pip install -e ".[test]"
python -m pytest
```

## Structure de l'API

La couche HTTP facultative se trouve dans `src/pokemon_battle/api/`.
Installer ses dépendances avec `python -m pip install -e ".[api]"`.
Le point d'entrée est `pokemon_battle.api.app:app`.

- `POST /battles` : corps `first_species`, `second_species`.
- `GET /battles/{battle_id}` : identifiant UUID.
- `POST /battles/{battle_id}/turns` : attaques `first_move`, `second_move` (0 à 3),
  précondition `expected_turn` et clé UUID `idempotency_key` obligatoires.

### Exemple complet : créer un combat

`POST /battles` est implémenté : contrôleur → `BattleService` → contrat
`BattleRepository` → `SqliteBattleRepository` → table SQLite `battles`.
SQLite utilise uniquement la bibliothèque standard Python.

```json
{"first_species": "bulbizarre", "second_species": "salameche"}
```

Le catalogue de démonstration propose `bulbizarre`, `salameche` et `carapuce`.
La réponse **201** contient l'UUID, le tour initial (0), les deux combattants avec
leurs PV et PP, et `winner: null`. Les identités des combattants sont distinctes,
y compris pour deux exemplaires de la même espèce. Une espèce inconnue donne
**400**, un corps invalide **422** ; aucune écriture n'a lieu dans ces cas.

Le démarrage de l'application initialise la table, sans créer de combat.
Par défaut, la base est `battles.sqlite3` dans le répertoire de lancement.
`create_app(database_path)` permet d'en choisir le chemin, notamment en test.
La base conserve un instantané JSON des définitions et de l'état, indépendant
des changements ultérieurs du catalogue. Le repository sait relire cet instantané.
Ce stockage simple convient à cet exemple ; les migrations restent à prévoir pour
faire évoluer le format des instantanés.

`GET /battles/{battle_id}` passe par le service et le repository pour retourner
l'état sauvegardé avec **200**, sans modifier la base ni dépendre du catalogue actuel.
Un combat absent donne **404** et un identifiant UUID mal formé **422**.
Les combats terminés restent consultables avec leur vainqueur.

### Jouer un tour

`POST /battles/{battle_id}/turns` accepte par exemple
`{"first_move": 0, "second_move": 1, "expected_turn": 0, "idempotency_key": "6d29c7bf-aed6-49ef-ab43-b45df370d574"}`.
Les indices commencent à zéro. `expected_turn` est le dernier numéro de tour
reçu du serveur ; générer une nouvelle clé UUID pour chaque nouvelle intention de jeu.
Le service charge le combat, vérifie les choix, appelle le moteur puis sauvegarde
l'état. Une transaction SQLite `BEGIN IMMEDIATE` couvre la lecture et l'écriture
sur la même connexion. Le service recherche d'abord un reçu associé au combat et
à la clé dans `battle_turns` :

- Même clé et même contenu : restituer le résultat initial, événements compris,
  sans appeler le moteur, même si le combat a évolué ou est terminé.
- Même clé et autre contenu : **409**.
- Nouvelle clé mais `expected_turn` différent du tour enregistré : **409** sans jouer.
- Nouvelle clé et tour attendu correct : résoudre le tour puis enregistrer l'état
  et le reçu dans la même transaction. Une panne annule les deux écritures.

Deux requêtes concurrentes visant le même tour ne peuvent donc consommer les PP
qu'une seule fois. Les contraintes uniques `(battle_id, idempotency_key)` et
`(battle_id, expected_turn)` protègent également la base. Cette garantie est partagée
par les processus utilisant le même fichier SQLite ; elle ne repose pas sur un verrou Python.
Si la réservation SQLite expire, la requête échoue sans succès annoncé et peut être
réessayée avec sa clé initiale.

Les reçus réussis sont conservés en base sans expiration et survivent au redémarrage.
Les demandes refusées ne réservent pas de clé. La table s'ajoute automatiquement au
prochain démarrage de FastAPI, sans supprimer les combats existants.
Une réponse répétée contient l'état du tour initial : un GET donne l'état courant.

La réponse **200** contient `battle` (même structure que le GET) et `events` dans
l'ordre d'exécution. Chaque événement porte `type` : `attack_used`, `attack_missed`,
`damage_dealt`, `knocked_out` ou `battle_ended`. Le multiplicateur `effectiveness`
des dégâts est un nombre JSON (0, 0.25, 0.5, 1, 2 ou 4).

`attack_used` fournit aussi `attack_type` et `attack_slot` pour identifier le type
élémentaire et le choix d'attaque sans dépendre du libellé traduit. Ces champs sont
nuls sur les anciens reçus ; leur relecture idempotente reste possible.

Erreurs : **404** si le combat est absent, **409** s'il est terminé ou en cas de conflit
de tour/clé, **400** pour une attaque inexistante ou sans PP, **422** pour une requête
mal formée ou des métadonnées d'idempotence manquantes.
Les erreurs de stockage ne sont pas converties en erreurs de choix d'attaque.
Le moteur reste indépendant de FastAPI et SQLite. Aucun serveur n'est démarré automatiquement.

### Exécuter un combat dans PowerShell

Depuis le dossier du projet, sans installation ni serveur :

```powershell
$env:PYTHONPATH = Join-Path $PWD 'src'
python -m pokemon_battle.demo --seed 42
```

Pour voir les événements détaillés (attaques, dégâts, PP, KO) :

```powershell
python -m pokemon_battle.demo --seed 42 --debug
```

La démonstration fait combattre Bulbizarre et Salamèche jusqu'au KO. Avec la graine
42, Salamèche gagne au troisième tour avec 83 PV. La même graine reproduit les
choix aléatoires ; les UUID restent uniques. La base SQLite de démonstration est
temporaire et supprimée à la fin, indépendamment de la base de l'API.

Les logs utilisent `logging` : **INFO** pour la création, les tours enregistrés et
le vainqueur ; **DEBUG** pour chaque événement ; **WARNING** pour les choix refusés ;
**ERROR** avec la trace pour les erreurs SQLite. Les succès ne sont journalisés
qu'après validation de la transaction. Le domaine lui-même conserve ses événements
structurés sans configurer de logs. L'API active INFO au démarrage si aucune
configuration de logging n'est déjà en place.

## Interface React

L'interface Vite existante dans `frontend/my-app` utilise React, TypeScript et
Tailwind CSS. Elle permet de créer un combat, choisir les attaques des deux
combattants, lire les événements et recommencer. FastAPI conserve l'autorité sur
les PV, PP, tours et vainqueur. Les appels HTTP sont centralisés dans le hook et
son client API ; les composants d'affichage ne connaissent pas le réseau.

Voir `frontend/my-app/README.md` pour lancer FastAPI sur le port 8000 puis Vite,
et pour les tests frontend (`npm test`) et le build (`npm run build`).

L'arène reprend le HTML de référence fourni : thème bleu nuit et Pokémon en diagonale.
Les illustrations 2D sont récupérées depuis PokéAPI avec cache et repli en cas d'échec.
Les attaques du catalogue ont des effets 3D Three.js joués selon les événements
FastAPI (flammes, eau, lianes, impact), avec option de désactivation et respect des
mouvements réduits. Le moteur et les règles de calcul ne changent pas.

Le bouton **Lancer le POC 3D** ouvre Pikachu contre Salamèche avec deux modèles
locaux `.glb` stylisés, un terrain en volume, une caméra manipulable et des animations
de repos, attaque, impact et KO. Ce sont des modèles créés pour le POC, pas les
modèles officiels des jeux. Les autres espèces utilisent les illustrations ; un
échec WebGL revient à cette vue. Les résultats restent entièrement ceux de FastAPI.

L'affichage suit l'ordre des événements : PP au début de l'attaque, PV et KO à
l'impact, victoire à la fin du dernier clip. Cette projection est dérivée des
réponses serveur, sans second état métier stocké. Sans animations, les résultats
complets apparaissent immédiatement.

Les attaques ont une charge, une projection et un impact avec lumière locale ;
Éclair produit des arcs électriques ramifiés et le feu un jet de particules.
Pikachu possède Éclair pour les nouveaux combats après redémarrage de FastAPI.
Le bouton **Activer le son** et le réglage du volume ajoutent des bruitages Web Audio
synthétisés pour chaque famille d'attaque, synchronisés sur la lecture des événements.
Le son s'arrête quand l'onglet est masqué ou le combat redémarre ; aucun son n'est
lancé automatiquement à l'ouverture de la page.

L'arène accueille 28 spectateurs 3D dans des gradins, avec un repli CSS en vue 2D.
Le public attend l'impact pour applaudir, réagit aux attaques manquées et aux
immunités, puis se lève lors d'un KO et acclame le vainqueur. Ces réactions suivent
les événements affichés ; les mouvements réduits conservent des poses fixes.

Le catalogue complet expose 1 025 espèces en français avec recherche, types,
catégories, générations et versions datées. Chaque espèce est sélectionnable pour
les deux combattants. Les dates portent sur les jeux et le début des générations.
La provenance de l'instantané, les règles des kits de combat simplifiés et la
procédure de mise à jour sont décrites dans `docs/catalogue.md`.

## Adaptateur Mistral

Le transport asynchrone `mistral/client.py` utilise HTTPX avec un transport injectable
pour les tests. `mistral/llm_adapter.py` accepte les descriptions JSON des outils
via `complete(messages, tools=..., tool_choice="auto")`, conserve les appels dans
`Completion.tool_calls` et accepte une réponse assistant sans texte lorsqu'elle
contient des appels d'outils. Les messages de résultat portent `tool_call_id` et
éventuellement `name`, afin de poursuivre la conversation avec le modèle.

Les contrats `Message`, `Completion` et `ToolCall` vivent dans
`application/ai/generation.py`. Le domaine de combat reste dans `domain.py` : ne
pas créer un paquet `domain/` homonyme sans migration de ses définitions métier.

`core/config.py` cherche le `.env` à la racine du projet. Les paramètres utiles
sont `MISTRAL_API_KEY` et `MISTRAL_CHAT_MODEL` ; la clé reste uniquement côté backend.
L'adaptateur ne contient aucun outil capable de modifier directement un combat.
`application/ai` fournit maintenant le `ToolsContext`, les cinq outils, la boucle
`ToolCallingOpponent` et la stratégie de secours `LocalOpponent`. Une décision est
bornée par défaut à 4 requêtes modèle, 8 appels d'outils et 8 secondes au total.
Les arguments sont validés avec Pydantic et la décision ne modifie aucun combat.
L'outil `estimate_damage` partage la formule du moteur et fournit les dégâts possibles,
la moyenne tenant compte de la précision et la probabilité de KO sur les PV actuels.
Il ne consomme ni PP ni hasard ; ses résultats figurent dans les observations du rapport.
La route `POST /battles/{id}/ai-turns` et le mode **Adversaire IA Mistral** de l'arène
sont branchés : cocher le mode avant le premier tour, puis choisir seulement l'attaque
du premier combattant. Configurer `MISTRAL_API_KEY` uniquement côté backend et relancer
Uvicorn après mise à jour du code. En cas de panne, le tour utilise un secours local
explicitement signalé.

L'API Conversations conserve les échanges chez Mistral. SQLite conserve la référence
et les résultats d'outils en attente ; une rotation après trois décisions ou au seuil
de 12 000 tokens de prompt réinjecte seulement les trois derniers tours résolus.
L'appel réseau se fait hors transaction. Combat, session et reçus idempotents sont
sauvegardés atomiquement après revérification du tour. Les tables supplémentaires
sont créées au démarrage, sans suppression des combats existants.
Voir `docs/ai.md` pour le contrat, la consommation de contexte et les limites.
Le module de sécurité importé d'un autre projet,
inutilisé et dépendant de `app.*`, a été retiré ; aucune authentification n'est ajoutée.

Les tests utilisent uniquement une clé factice construite sans lire le `.env`
et `httpx.MockTransport`. Pour les exécuter dans l'environnement du projet :

```powershell
uv sync --extra test
.venv/Scripts/python.exe -m pytest -q
```

Ils couvrent les appels simples et multiples, le retour des résultats d'outils,
les réponses textuelles, les erreurs HTTP et JSON, les délais dépassés et l'absence
de clé. Aucun test ne consomme l'API Mistral réelle.

Pour lancer manuellement un cas réel de l'agent, avec outils, logs de décision et
rapport de métriques, configurer `MISTRAL_API_KEY` côté backend puis exécuter :

```powershell
.venv/Scripts/python.exe -m pokemon_battle.ai_smoke --timeout 30 --output artifacts/ai-real.json
```

Pikachu doit choisir Charge face à Sabelette (Sol) plutôt qu'Éclair. Le script
exécute ensuite un tour en mémoire. `--dry-run` teste le même parcours sans modèle
réel ni lecture de configuration. Les critères, métriques, codes de sortie et
limites sont décrits dans `docs/ai.md`.

Pour comparer plusieurs décisions, la suite propose sept scénarios (immunité,
slots inversés, faiblesse, résistance, PP épuisés, double faiblesse et potion sans PP) :

```powershell
.venv/Scripts/python.exe -m pokemon_battle.ai_smoke --suite --repeat 3 --output artifacts/ai-suite-real.json
```

Les résultats d'outils donnent maintenant le nom, l’emplacement d’attaque et un libellé explicite
d'efficacité. La consigne générale demande de respecter ces résultats ; un choix
inefficace reste autorisé et fait échouer le critère stratégique. Le rapport v2
distingue `provider_responded` de `agent_checks_passed`, conserve chaque tentative
et agrège les taux de réussite et de repli sans masquer les mauvaises décisions.
Ajouter `--dry-run` pour simuler la suite sans Mistral.

Pour tester une sélection réelle de potion, utiliser
`--scenario potion_only --repeat 3 --timeout 30 --output artifacts/ai-potion-real.json`
avec la même commande `python -m pokemon_battle.ai_smoke`. L'IA commence blessée,
sans PP, avec une dernière potion ; les critères vérifient le soin, sa priorité,
le stock et la survie. Sans `--dry-run`, ces commandes appellent réellement Mistral.
