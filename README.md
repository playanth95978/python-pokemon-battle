# Pokémon battle domain

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
generation-specific Pokémon simulator. No critical hits, priority, status conditions,
abilities, items, switching, healing, or automatic Struggle. Exhausted moves are rejected.

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
- `POST /battles/{battle_id}/turns` : corps `first_move`, `second_move`, indices de 0 à 3.

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
`{"first_move": 0, "second_move": 1}`. Les indices commencent à zéro.
Le service charge le combat, vérifie les choix, appelle le moteur puis sauvegarde
l'état. Une transaction SQLite `BEGIN IMMEDIATE` couvre la lecture et l'écriture
sur la même connexion : deux requêtes concurrentes sont traitées successivement
sans écraser les tours. Il n'y a pas de déduplication : renvoyer la même requête
peut donc jouer un tour supplémentaire. Une erreur annule l'écriture.

La réponse **200** contient `battle` (même structure que le GET) et `events` dans
l'ordre d'exécution. Chaque événement porte `type` : `attack_used`, `attack_missed`,
`damage_dealt`, `knocked_out` ou `battle_ended`. Le multiplicateur `effectiveness`
des dégâts est un nombre JSON (0, 0.25, 0.5, 1, 2 ou 4).

Erreurs : **404** si le combat est absent, **409** s'il est terminé, **400** pour
une attaque inexistante ou sans PP, **422** pour une requête mal formée.
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
