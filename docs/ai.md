# Décision adverse avec outils

Le moteur de combat reste indépendant de FastAPI, SQLite et Mistral. Le module
`application/ai` produit seulement une `AttackDecision` ; il ne résout pas de tour
et ne résout aucune modification directement. `AiBattleService` orchestre ensuite
la résolution et la persistance du tour. Il n'y a pas de MCP, de RAG ou d'embeddings.

## Contexte et outils

Le service HTTP et le smoke utilisent désormais le mode **précalculé** : les six
outils de lecture sont exécutés localement sur le nouvel instantané, avant tout appel
réseau. Leurs observations sont envoyées dans le premier message. Mistral ne reçoit
que `select_attack` et `select_potion` et choisit en une requête, plus une correction éventuelle.
Les deux sélections restent déclarées même si l'une est indisponible ce tour : le
contrat Conversations reste stable et le backend valide toujours leur légalité.
Une sélection refusée (slot illégal, potion indisponible, outil de lecture) est renvoyée
au modèle, qui dispose d'un unique round de correction ; un second refus, une réponse sans
appel ou une panne déclenche le secours identifié. Avec Conversations, les observations sont
insérées comme objet JSON dans `current_request`, sans chaîne JSON échappée.

Les adaptateurs limitent la génération à `max_tokens=150`. Les arguments d'une
réponse tronquée restent soumis à la validation habituelle.
Le modèle ne reçoit ni le choix humain courant ni les attaques adverses non révélées.
Les calculs locaux ne consomment ni PP, ni potion, ni hasard du moteur.

`metrics.precomputed_tools` compte les lectures locales ; `tool_calls_requested`
et `tool_calls_executed` comptent seulement les appels demandés par le modèle.
Le rapport indique `decision_mode="precomputed"` ou `"exploratory"`.
Les observations fraîches accompagnent chaque continuation de conversation, avec
la mémoire bornée et le résultat de la dernière sélection. L'empreinte des outils
force la recréation des conversations utilisant l'ancien contrat exploratoire.

Pour comparer avec l'ancienne boucle, le smoke accepte `--exploratory-tools` :

```powershell
# Mode optimisé, 30 décisions réelles (configuration Mistral requise).
.venv/Scripts/python.exe -m pokemon_battle.ai_smoke --suite --repeat 3 --timeout 30 --output artifacts/ai-optimized.json
# Mode exploratoire, même modèle et plafond de sortie de 150 tokens également.
.venv/Scripts/python.exe -m pokemon_battle.ai_smoke --exploratory-tools --suite --repeat 3 --timeout 30 --output artifacts/ai-exploratory.json
```

Ajouter `--dry-run` pour tester les deux parcours sans réseau. Comparer réussite,
replis, `model_requests`, `mean_elapsed_ms` et tokens réellement rapportés. La
simulation vérifie le câblage ; elle ne prouve ni la qualité du nouveau prompt
ni un gain réel de coût ou de latence. Aucun calcul anticipé pendant le choix du joueur
n'est lancé. Les descriptions de plusieurs rounds ci-dessous concernent le
mode exploratoire, conservé par `ToolCallingOpponent(precompute_reads=False)`.

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
| `inspect_battle` | Tour et vues visibles des deux combattants, dont statut, crans, vitesse effective et protection du tour précédent |
| `list_legal_moves` | Slots jouables, PP, puissance, précision, catégorie, type, priorité, cible et effets typés |
| `evaluate_matchups` | Efficacité issue de la table métier, sans prédiction de dégâts |
| `estimate_damage` | Dégâts minimum/maximum si touche, moyenne avec précision et probabilité de KO pour chaque emplacement d’attaque jouable |
| `evaluate_status_moves` | Pour chaque attaque de statut jouable : cible, priorité, probabilité de toucher et, par effet, réussite ou raison d'échec prévisible (`already_has_status`, `immune`, `stat_limit`, `consecutive_protection`) |
| `estimate_healing` | PV rendus par une potion, PV après soin et stock restant, ou raison de l'indisponibilité (KO, PV pleins, stock vide) |
| `estimate_incoming_damage` | Risque réel : dégâts et probabilité de KO des attaques adverses déjà utilisées (PP entamés), sur les PV actuels et après une potion, et ordre d'action si les deux attaquent |
| `select_attack` | Slot validé et commentaire facultatif de 160 caractères maximum |
| `select_potion` | Potion à la place d'une attaque, commentaire facultatif ; refusée (`potion_unavailable`) si les PV sont pleins ou le stock vide |

Les schémas JSON proviennent des modèles Pydantic utilisés pour la validation.
Les paramètres supplémentaires sont interdits ; l’emplacement d’attaque doit être un entier strict
de 0 à 3, présent et doté de PP. Un outil inconnu ou un appel invalide retourne une
erreur structurée au modèle, qui peut se corriger dans le budget restant.
Le premier `select_attack` ou `select_potion` valide termine la décision ; les autres appels du même
lot ne peuvent ni remplacer ce choix ni modifier le combat.

Les résultats de `evaluate_matchups` associent l’emplacement d’attaque et le nom de l'attaque à
son type, aux types de la cible, au multiplicateur, à un libellé (`immune`,
`resisted`, `neutral`, `super_effective`) et à une explication. La consigne générale
du modèle lui demande de consulter `estimate_damage` et de faire référence aux résultats métier,
sans leur substituer une connaissance supposée des jeux. Un multiplicateur nul
est expliqué comme une immunité. Ce guidage ne bloque pas une attaque inefficace
mais légale : une mauvaise décision doit rester visible dans l'évaluation.

`estimate_healing` et `select_potion` partagent avec le moteur la règle pure
`potion_healing` (20 PV au plus, sans dépasser le maximum) et son ordre de contrôle.
La décision porte alors `action_type: "potion"` et `attack_slot: null` ; le moteur
résout la potion. Les reçus antérieurs, sans `action_type`, restent exposés comme attaques.
Une décision démarre dès qu'une action est jouable : sans PP, une potion utilisable
suffit. Le secours local choisit une attaque, ou la potion s'il ne reste aucun PP.
`list_legal_moves` indique `potion_available` et, sans attaque jouable, invite à
`select_potion` ; `estimate_healing` ajoute `next_step` quand le soin est possible.
Le dernier round de la boucle n'offre que les outils de sélection possibles, pour qu'un
modèle qui observe sans conclure doive choisir. Avec Conversations, Mistral conserve les
outils déclarés à la création : cette restriction n'y a pas d'effet.

`estimate_damage` accepte `{}` et retourne `estimates` ainsi qu'une hypothèse explicite.
Les attaques de statut (sans puissance) n'y figurent pas, ni parmi les menaces de
`estimate_incoming_damage` : `evaluate_status_moves` les décrit, avec les mêmes contrôles
d'échec que le moteur (`status_failure`, `stage_after`).
Il utilise la même fonction pure `damage_for_roll` que le moteur : niveau, attaque/défense
physiques ou spéciales et leurs crans, brûlure de l'attaquant, puissance, bonus de même
type, efficacité et arrondis.
Les 16 tirages uniformes de 85 à 100 sont énumérés sans RNG et les dégâts sont bornés
aux PV actuels de la cible. Les attaques sans PP sont exclues ; une immunité donne zéro.

- `min_damage_on_hit`, `max_damage_on_hit`, `mean_damage_on_hit` : dégâts si l'attaque touche ;
- `hit_probability` : précision divisée par 100 ;
- `expected_damage` : moyenne des dégâts, échecs de précision compris ;
- `ko_probability` : proportion des tirages provoquant le KO, multipliée par la précision.

`estimate_incoming_damage` ordonne les combattants par vitesse effective (crans puis
paralysie). Une attaque de l'agent dont la priorité dépasse toutes celles déjà révélées
par l'adversaire passe d'abord. Un paralysé n'agit que trois fois sur quatre : les
probabilités de KO avant riposte et les menaces adverses en tiennent compte.

Le secours local paralyse ou brûle d'abord un adversaire sans statut à plus de la moitié
de ses PV, si l'effet s'appliquerait vraiment ; sinon il garde l'heuristique de dégâts.
Sans attaque à dégâts jouable, il choisit une attaque de statut utile, puis la première jouable.

Ce calcul suppose que l'acteur peut agir sur la cible dans son état actuel : il ne
prévoit ni le choix adverse, ni un KO de l'acteur avant son action, ni les tours suivants.
Les estimations sont mémorisées dans les observations et figurent dans les rapports JSON.
Les statistiques copiées sont immuables ; aucun PV, PP, tour ou état aléatoire n'est modifié.
La stratégie locale de secours reste l'heuristique décrite ci-dessous.

## Boucle et repli

`ToolCallingOpponent` reçoit un `CompletionClient`, satisfait par
`MistralLLMAdapter` ou par un faux client dans les tests. Il transmet les outils au
modèle, ajoute chaque message assistant puis les résultats avec leur `tool_call_id`.
Le modèle doit terminer par `select_attack` ou `select_potion` ; une réponse textuelle n'est pas
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
`player_action` (`{"action_type":"potion"}` ou une attaque avec `attack_slot`),
`expected_turn` et `idempotency_key`. L'ancien `player_move` reste accepté seul pour
une attaque ; `second_move` et les commandes mélangeant les deux formats sont interdits.
La réponse contient `battle`, `events`, `decision` et `metrics`.

Dans l'arène, cocher **Adversaire IA Mistral** avant le premier tour. Seule l'attaque
ou la potion du premier combattant doit alors être sélectionnée. Le mode est verrouillé après
le premier tour et réinitialisé au nouveau combat. Une réponse de secours est affichée
comme telle. Les PV, PP, potions, événements et vainqueur restent ceux du serveur.
L'IA continue de choisir parmi ses attaques ; le soin est ici une action disponible
pour le joueur. Les reçus IA comparent l'action humaine complète, avec relecture
compatible des anciens reçus contenant `player_move`.

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
Mistral fige les outils à la création d'une conversation. `ConversationState` enregistre
donc `tools_version`, empreinte des schémas d'outils : une conversation créée avec un autre
contrat, ou antérieure à ce champ, est recréée au tour suivant (événement `conversation_reset`).
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

Pour tester réellement la sélection d'une potion :

```powershell
.venv/Scripts/python.exe -m pokemon_battle.ai_smoke --scenario potion_only --repeat 3 --timeout 30 --output artifacts/ai-potion-real.json
```

Pikachu commence à 10/110 PV, sans PP et avec une potion. Le modèle doit choisir
`select_potion` ; le moteur soigne de 20 PV avant le coup adverse et consomme le stock.
Le rapport vérifie `expected_action`, `healing_applied`, `potion_consumed_once`,
`healed_before_attack` et `survives_turn`, ainsi que l'absence de mutation pendant la décision.
Un repli local ne valide pas le test du fournisseur. Ajouter `--dry-run` pour simuler
sans réseau. Ce cas vérifie le parcours de la seule action jouable, pas un arbitrage
stratégique entre plusieurs bonnes options. La graine contrôle les dégâts du moteur,
pas les décisions du modèle. Chaque répétition commence avec un combat neuf.

Les sept scénarios emploient des statistiques et kits simplifiés, construits pour
tester des propriétés ciblées :

| Identifiant | Propriété vérifiée | Slot attendu |
| --- | --- | --- |
| `pikachu_vs_ground` | Éviter Éclair face à l'immunité Sol | 1 |
| `reversed_slots` | Même situation avec les slots inversés | 0 |
| `water_weakness` | Exploiter la faiblesse électrique de l'Eau | 0 |
| `grass_resistance` | Préférer Charge à Éclair résisté dans cette configuration | 1 |
| `exhausted_move` | Écarter Éclair sans PP même s'il serait super efficace | 1 |
| `double_weakness` | Exploiter la double faiblesse de Paras au Feu | 1 |
| `potion_only` | Se soigner à 10 PV, sans PP, avec une dernière potion ; survivre au tour | Potion |

Les réponses attendues servent seulement aux contrôles et logs locaux. Elles ne
sont pas transmises au modèle et ne sont pas utilisées pour remplacer ses choix.
La consigne est identique pour tous les scénarios. La table n'est pas une recherche
de stratégie optimale dans l'ensemble des règles Pokémon.

```powershell
# 7 scénarios, 3 répétitions chacun : 21 décisions réelles, séquentielles.
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

## Scénarios de choix attaque/potion

`finish_over_heal`, `heal_to_survive` et `no_heal_needed` offrent attaque et potion à la fois,
avec une Griffe adverse déjà révélée. Leurs PV sont calibrés sur la formule du moteur pour que la
bonne réponse ne dépende d'aucun tirage : KO certain en attaquant le premier, mort certaine sans
soin, ou aucun risque. Une attaque adverse jamais utilisée reste inconnue de l'agent.
Chaque scénario vérifie aussi son issue après résolution (`expected_outcome` :
adversaire KO ou agent en vie), pour qu'un bon type d'action suivi d'une mort ne passe pas.
`estimate_incoming_damage` ne déclare un KO avant riposte que s'il est garanti et que l'agent
agit en premier ; sinon il donne la meilleure probabilité (`best_ko_before_riposte`).
À vitesse égale, le moteur tire l'ordre au sort : l'outil annonce 50 % de chances d'agir en
premier (`agent_first_probability`) et pondère d'autant la probabilité de KO avant riposte.
