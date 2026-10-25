# Décision adverse avec outils

Le moteur de combat reste indépendant de FastAPI, SQLite et Mistral. Le module
`application/ai` produit seulement une `AttackDecision` ; il ne résout pas de tour
et ne résout aucune modification directement. `AiBattleService` orchestre ensuite
la résolution et la persistance du tour. Il n'y a pas de MCP, de RAG ou d'embeddings.

## Contexte et outils

Les réponses des outils et les décisions utilisent `attack_slot` pour désigner
l'emplacement d'attaque. `select_attack` attend `{"attack_slot": 0}` ; l'ancien
argument `slot` reste accepté pour les conversations déjà créées. Une décision
HTTP est toujours exposée avec `attack_slot`, même lors de la reprise d'un ancien reçu.
Les types d'événements conservent leur champ `type` : ce ne sont pas des actions.

`ToolsContext.from_record(record, fighter_id, expected_turn)` refuse les combats
terminés, les tours périmés, les combattants étrangers et l'absence d'attaque jouable.
Il copie dans des dataclasses immuables les informations visibles : tour, identité,
PV, niveau, types, statistiques des deux combattants et attaques du combattant IA. L'adversaire n'expose pas son
catalogue d'attaques ; le choix actuel du joueur n'est jamais accepté par ce contrat.
Le contexte ne conserve aucun `Fighter` mutable ou repository.

La mémoire `observations` et la décision sélectionnée appartiennent à ce contexte
uniquement. Créer un nouveau contexte par décision ; ne pas le réutiliser après
une évolution du combat. Les budgets et le contexte d'outils sont propres à chaque
décision ; la conversation distante peut continuer entre plusieurs tours du même combat.

| Outil | Résultat |
| --- | --- |
| `inspect_battle` | Tour et vues visibles des deux combattants |
| `list_legal_moves` | Slots jouables, PP, puissance, précision, catégorie et type |
| `evaluate_matchups` | Efficacité issue de la table métier, sans prédiction de dégâts |
| `estimate_damage` | Dégâts minimum/maximum si touche, moyenne avec précision et probabilité de KO pour chaque emplacement d’attaque jouable |
| `select_attack` | Slot validé et commentaire facultatif de 160 caractères maximum |

Les schémas JSON proviennent des modèles Pydantic utilisés pour la validation.
Les paramètres supplémentaires sont interdits ; l’emplacement d’attaque doit être un entier strict
de 0 à 3, présent et doté de PP. Un outil inconnu ou un appel invalide retourne une
erreur structurée au modèle, qui peut se corriger dans le budget restant.
Le premier `select_attack` valide termine la décision ; les autres appels du même
lot ne peuvent ni remplacer ce choix ni modifier le combat.

Les résultats de `evaluate_matchups` associent l’emplacement d’attaque et le nom de l'attaque à
son type, aux types de la cible, au multiplicateur, à un libellé (`immune`,
`resisted`, `neutral`, `super_effective`) et à une explication. La consigne générale
du modèle lui demande de consulter `estimate_damage` et de faire référence aux résultats métier,
sans leur substituer une connaissance supposée des jeux. Un multiplicateur nul
est expliqué comme une immunité. Ce guidage ne bloque pas une attaque inefficace
mais légale : une mauvaise décision doit rester visible dans l'évaluation.

`estimate_damage` accepte `{}` et retourne `estimates` ainsi qu'une hypothèse explicite.
Il utilise la même fonction pure `damage_for_roll` que le moteur : niveau, attaque/défense
physiques ou spéciales, puissance, bonus de même type, efficacité et arrondis.
Les 16 tirages uniformes de 85 à 100 sont énumérés sans RNG et les dégâts sont bornés
aux PV actuels de la cible. Les attaques sans PP sont exclues ; une immunité donne zéro.

- `min_damage_on_hit`, `max_damage_on_hit`, `mean_damage_on_hit` : dégâts si l'attaque touche ;
- `hit_probability` : précision divisée par 100 ;
- `expected_damage` : moyenne des dégâts, échecs de précision compris ;
- `ko_probability` : proportion des tirages provoquant le KO, multipliée par la précision.

Ce calcul suppose que l'acteur peut agir sur la cible dans son état actuel : il ne
prévoit ni le choix adverse, ni un KO de l'acteur avant son action, ni les tours suivants.
Les estimations sont mémorisées dans les observations et figurent dans les rapports JSON.
Les statistiques copiées sont immuables ; aucun PV, PP, tour ou état aléatoire n'est modifié.
La stratégie locale de secours reste l'heuristique décrite ci-dessous.

## Boucle et repli

`ToolCallingOpponent` reçoit un `CompletionClient`, satisfait par
`MistralLLMAdapter` ou par un faux client dans les tests. Il transmet les outils au
modèle, ajoute chaque message assistant puis les résultats avec leur `tool_call_id`.
Le modèle doit terminer par `select_attack` ; une réponse textuelle n'est pas
interprétée comme une action. La sélection termine la boucle sans appel supplémentaire.

Limites configurables au constructeur :

- `max_rounds=4` : requêtes au modèle ;
- `max_tool_calls=8` : appels d'outils, y compris invalides ;
- `timeout_seconds=8` : budget global incluant tous les échanges.

Un lot dépassant le budget d'outils n'est pas exécuté. Un délai dépassé, une clé
absente, une erreur fournisseur, une réponse sans outil ou l'épuisement d'un budget
déclenche `LocalOpponent`. Une annulation par le demandeur reste une annulation,
sans décision tardive de secours. Les erreurs de programmation ne sont pas masquées.

La stratégie locale classe les attaques jouables par puissance × précision ×
efficacité × bonus du même type. Les égalités favorisent le plus petit emplacement d’attaque. Cette
heuristique déterministe n'est pas la formule de dégâts et ne consomme pas le hasard
du moteur. Le résultat indique `source="llm"` ou `source="local"` et, dans ce dernier
cas après repli, un `fallback_reason`. Les logs de repli ne contiennent ni clé,
conversation ni contenu des réponses fournisseur.

## Utilisation applicative

```python
from pokemon_battle.application.ai.opponent import ToolCallingOpponent
from pokemon_battle.application.ai.tools_context import ToolsContext
from pokemon_battle.mistral.llm_adapter import MistralLLMAdapter

# record et client sont fournis par le service appelant.
context = ToolsContext.from_record(record, record.battle.second.id, expected_turn)
policy = ToolCallingOpponent(MistralLLMAdapter(client))
decision = await policy.choose(context)
```

Le branchement HTTP et React est disponible via `POST /battles/{battle_id}/ai-turns`.
Le premier combattant est humain, le second contrôlé par l'IA. La demande contient
seulement `player_move`, `expected_turn` et `idempotency_key` ; `second_move` est interdit.
La réponse contient `battle`, `events`, `decision` et `metrics`.

Dans l'arène, cocher **Adversaire IA Mistral** avant le premier tour. Seule l'attaque
du premier combattant doit alors être sélectionnée. Le mode est verrouillé après
le premier tour et réinitialisé au nouveau combat. Une réponse de secours est affichée
comme telle. Les PV, PP, événements et vainqueur restent ceux du serveur.

## Conversations persistantes et mémoire tactique

`MistralConversationAdapter` utilise l'API Conversations avec le modèle configuré,
sans création d'agent distant ni nouvelle dépendance. Les appels HTTP sont faits
par `MistralClient`, partagé pendant la durée de vie de l'application et fermé à l'arrêt.
La configuration est chargée seulement au premier usage de l'IA ; aucune clé ne sort du backend.

- Création : `POST /v1/conversations`, `model`, `instructions`, `tools`, `inputs`,
  `store=true`, `stream=false` et paramètres sous `completion_args`.
- Continuation : `POST /v1/conversations/{id}`, seulement les nouvelles entrées et
  les paramètres autorisés. Le dernier `conversation_id` retourné remplace l'ancien.
- Les sorties `function.call` sont validées, puis exécutées localement avec les
  mêmes schémas Pydantic et budgets que Chat Completions.
- Chaque résultat est une entrée `function.result` avec `tool_call_id` et `result`
  JSON sérialisé. Le résultat de `select_attack` reste en attente en SQLite ; il
  rejoint la prochaine continuation avec la demande du tour suivant, sans appel
  supplémentaire au modèle après la sélection.

SQLite conserve deux tables ajoutées sans modifier les combats existants :

| Table | Contenu |
| --- | --- |
| `battle_ai_sessions` | Une session pour le second combattant du combat : curseur distant, résultats en attente, modèle, compteurs, trois derniers tours résolus et réservation temporaire |
| `battle_ai_requests` | Commande humaine, décision et métriques, pour rejouer la réponse sans régénérer l'IA |

Les événements des trois derniers tours résolus forment une mémoire structurée,
sans résumé généré par un LLM. Le choix humain en cours et le catalogue des attaques
adverses n'y sont jamais envoyés. Les outils lisent un nouvel instantané immuable
à chaque tour : les anciennes valeurs de PV/PP ne font pas référence.

Pour borner l'historique distant utilisé, le service démarre une nouvelle conversation
après trois décisions validées, ou lorsque le dernier appel a signalé au moins
12 000 tokens de prompt. Le résumé des trois tours est transmis à la nouvelle
conversation ; les anciennes estimations et messages ne sont pas recopiés.
Ces seuils sont configurables au constructeur. Le seuil de tokens déclenche une
rotation au tour suivant : ce n'est pas une limite stricte de tokens par requête.
Les anciennes conversations restent stockées chez Mistral ; la rotation ne les efface pas.
Un changement de modèle ou une décision interrompue invalide aussi le curseur.

L'historique réutilisé peut consommer des tokens ; `usage` est enregistré sans
inventer de coût ou de cache hit. La reprise n'est pas un thread Python suspendu :
aucun travail n'est actif pendant l'attente du joueur.

## Concurrence et idempotence du tour IA

1. Une courte transaction vérifie le reçu, le tour, les PP du joueur et réserve
   le combat pour une décision. Le reçu est vérifié avant l'état actuel, même après KO.
2. Mistral et les outils s'exécutent hors transaction, avec un délai global de
   30 secondes. La réservation SQLite de 120 secondes protège aussi plusieurs workers.
3. Une nouvelle transaction vérifie la réservation, le tour et les PP, puis résout
   avec le moteur partagé. Combat, reçu du tour, session IA et reçu de commande humaine
   sont validés ensemble. Toute erreur de sauvegarde annule ces écritures ensemble.
4. Une répétition de la même commande retourne le reçu, sans appel Mistral. Une
   clé réutilisée avec un contenu différent ou une décision concurrente reçoit 409.

Une réservation expirée peut être reprise après un crash ; son ancien propriétaire
ne peut plus sauvegarder. Une annulation ne déclenche pas de stratégie de secours.
Une panne du fournisseur ou un budget épuisé utilise la stratégie locale et abandonne
le dialogue distant incomplet. Un tour manuel concurrent peut gagner ; dans ce cas
la décision IA est refusée comme périmée. Le client conserve la commande pour réessayer
avec la même clé, ou propose de relire l'état du combat.

Références du contrat : [Conversations](https://docs.mistral.ai/api/endpoint/beta/conversations)
et [Function Calling des agents](https://docs.mistral.ai/studio/agents/agent-tools/function-calling).
Les tests couvrent ce format avec `httpx.MockTransport`, sans clé réelle ni facturation.
Les commandes `ai_smoke` ci-dessous conservent le parcours Chat Completions afin de
comparer les évaluations existantes ; la conversation persistante se teste dans l'arène
ou via cette route HTTP.

## Vérifications

```powershell
.venv/Scripts/python.exe -m pytest -q
```

Les tests couvrent les informations cachées, l'isolation de l'instantané, les outils,
les arguments invalides, le dialogue multi-outils, les budgets, les annulations,
les décisions concurrentes et un échange complet via `httpx.MockTransport`.
Aucun test ne lit de clé réelle ni n'appelle le fournisseur.

## Scénario réel lançable localement

Depuis la racine du projet, avec `MISTRAL_API_KEY` configurée uniquement dans
l'environnement backend ou le `.env` local (aucune clé dans la commande) :

```powershell
uv sync --extra test
.venv/Scripts/python.exe -m pokemon_battle.ai_smoke --timeout 30 --output artifacts/ai-real.json
```

Le script appelle réellement Mistral par défaut. `--model` permet de remplacer
`MISTRAL_CHAT_MODEL`. Il n'a besoin ni de FastAPI lancé, ni du frontend, ni d'une
base de données : il crée un combat temporaire en mémoire, sans toucher aux parties.

Le scénario est volontairement simple : Pikachu possède Éclair (attack_slot 0) et Charge
(attack_slot 1), face à Sabelette de type Sol. Le choix attendu est Charge ; Éclair est
légal mais inefficace. L'agent peut inspecter la situation, lister les attaques et
consulter les types avant de sélectionner son emplacement d’attaque. L'ordre et le nombre d'appels
ne sont pas imposés au LLM. Le choix du joueur n'est utilisé qu'après cette décision.
Le moteur résout alors un tour avec une graine fixe. Cette graine ne rend pas le
modèle déterministe.

Les logs console montrent chaque demande/réponse modèle, chaque résultat d'outil,
l’emplacement d’attaque retenu, la source de décision et un éventuel repli. Pour les conserver dans
PowerShell, ajouter `2> artifacts/ai-real.log` à la commande. Un refus HTTP est
diagnostiqué par son statut, sans journaliser les en-têtes ou le corps fournisseur.
Les commentaires courts éventuels sont dans la décision du rapport ; aucun
raisonnement interne du modèle n'est demandé ou enregistré.

Le rapport JSON comprend :

- `checks` : attack_slot légal, évitement de l'immunité, attack_slot attendu, sélection par l'agent,
  absence de mutation pendant la décision ;
- `decision` : attack_slot, source et motif éventuel du repli ;
- `metrics` : nombre de tentatives/réponses modèle, appels d'outils demandés/traités,
  erreurs d'outils, durée globale, temps passé en appels modèle, tokens communiqués ;
- `metrics.trace` et `observations` : séquence des étapes et résultats des outils ;
- `turn` et `events` : résultat du tour calculé par le moteur.

Les tokens absents ne sont pas inventés. Les compteurs sont cumulés pour les
réponses reçues ; `usage_complete=false` signale des informations manquantes ou
partielles. Ce sont les chiffres rapportés par le fournisseur, pas une facture ni
une estimation de coût. Aucun prix ou nombre de tokens n'est simulé.

Codes de sortie : `0` si tous les critères du scénario passent, `1` si un choix
inadéquat ou un repli local empêche de valider le vrai agent, `2` si la clé manque
ou les paramètres sont invalides. La durée de 30 secondes est propre au scénario ;
les budgets restent 4 requêtes et 8 outils, sans modifier les défauts applicatifs.

Pour vérifier le script sans aucun accès réseau ou fichier de configuration :

```powershell
.venv/Scripts/python.exe -m pokemon_battle.ai_smoke --dry-run --output artifacts/ai-smoke-simulation.json
```

Ce mode utilise un faux modèle qui interprète les résultats des outils avec une
heuristique locale. Il affiche `mode="simulation"`, `provider_responded=false` et
`agent_checks_passed=false`, même si le parcours simulé passe ses critères.
Il vérifie la plomberie et les scénarios, pas la qualité du LLM.

Le rapport utilise maintenant `schema_version=2`. L'ancien champ ambigu
`real_agent_verified` est remplacé par deux informations distinctes :

- `provider_responded` : au moins une réponse Mistral reçue, même si sa décision est mauvaise ;
- `agent_checks_passed` : les critères stratégiques ont passé avec une décision de l'agent réel, sans repli.

`passed` reste le résultat du scénario, y compris en simulation. `turn.fighters`
identifie les combattants par nom et identifiant, pour les scénarios hors Pikachu/Sabelette.

## Suite et répétitions

Les six scénarios emploient des statistiques et kits simplifiés, construits pour
tester des propriétés ciblées :

| Identifiant | Propriété vérifiée | Slot attendu |
| --- | --- | --- |
| `pikachu_vs_ground` | Éviter Éclair face à l'immunité Sol | 1 |
| `reversed_slots` | Même situation avec les slots inversés | 0 |
| `water_weakness` | Exploiter la faiblesse électrique de l'Eau | 0 |
| `grass_resistance` | Préférer Charge à Éclair résisté dans cette configuration | 1 |
| `exhausted_move` | Écarter Éclair sans PP même s'il serait super efficace | 1 |
| `double_weakness` | Exploiter la double faiblesse de Paras au Feu | 1 |

Les réponses attendues servent seulement aux contrôles et logs locaux. Elles ne
sont pas transmises au modèle et ne sont pas utilisées pour remplacer ses choix.
La consigne est identique pour tous les scénarios. La table n'est pas une recherche
de stratégie optimale dans l'ensemble des règles Pokémon.

```powershell
# 6 scénarios, 3 répétitions chacun : 18 décisions réelles, séquentielles.
.venv/Scripts/python.exe -m pokemon_battle.ai_smoke --suite --repeat 3 --timeout 30 --output artifacts/ai-suite-real.json

# Rejouer seulement l'immunité avec les slots inversés.
.venv/Scripts/python.exe -m pokemon_battle.ai_smoke --scenario reversed_slots --repeat 3 --output artifacts/ai-reversed.json

# Même suite sans accès réseau.
.venv/Scripts/python.exe -m pokemon_battle.ai_smoke --dry-run --suite --repeat 2 --output artifacts/ai-suite-simulation.json
```

Le mode simple et le scénario par défaut restent disponibles avec les commandes
précédentes. `--suite` et `--scenario` sont exclusifs. Chaque répétition crée un
combat et un contexte neufs ; les délais/budgets s'appliquent à chaque décision.
Une erreur ou un repli est enregistré et n'interrompt pas les scénarios suivants.

Le rapport de suite conserve chaque tentative dans `runs` et fournit `summary` :
réussites globales, taux de réponse fournisseur, taux de décisions LLM, taux de
repli, réussite stratégique parmi les seules décisions LLM, durées moyennes,
distribution des slots choisis, métriques et tokens cumulés, détail par scénario.
Un bon choix de secours ne gonfle pas le taux de réussite du modèle. Une suite
sans décision LLM affiche `strategy_success_among_llm=null`. Les métriques en
simulation ne mesurent pas la qualité du fournisseur.

Ces petits effectifs servent à comparer des comportements observés, sans garantir
qu'un prompt corrigé ne fera plus d'erreur. Aucun appel Mistral réel n'est effectué
par les tests automatisés.
