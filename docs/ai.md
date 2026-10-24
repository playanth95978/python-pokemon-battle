# Décision adverse avec outils

Le moteur de combat reste indépendant de FastAPI, SQLite et Mistral. Le module
`application/ai` produit seulement une `AttackDecision` ; il ne résout pas de tour
et ne persiste aucune modification. Il n'y a pas de MCP, de RAG ou d'embeddings.

## Contexte et outils

`ToolsContext.from_record(record, fighter_id, expected_turn)` refuse les combats
terminés, les tours périmés, les combattants étrangers et l'absence d'attaque jouable.
Il copie dans des dataclasses immuables les informations visibles : tour, identité,
PV, niveau, types et attaques du combattant IA. L'adversaire n'expose pas son
catalogue d'attaques ; le choix actuel du joueur n'est jamais accepté par ce contrat.
Le contexte ne conserve aucun `Fighter` mutable ou repository.

La mémoire `observations` et la décision sélectionnée appartiennent à ce contexte
uniquement. Créer un nouveau contexte par décision ; ne pas le réutiliser après
une évolution du combat. Les conversations et budgets sont également propres à
chaque appel, même lorsqu'une instance de stratégie sert plusieurs combats.

| Outil | Résultat |
| --- | --- |
| `inspect_battle` | Tour et vues visibles des deux combattants |
| `list_legal_moves` | Slots jouables, PP, puissance, précision, catégorie et type |
| `evaluate_matchups` | Efficacité issue de la table métier, sans prédiction de dégâts |
| `select_attack` | Slot validé et commentaire facultatif de 160 caractères maximum |

Les schémas JSON proviennent des modèles Pydantic utilisés pour la validation.
Les paramètres supplémentaires sont interdits ; le slot doit être un entier strict
de 0 à 3, présent et doté de PP. Un outil inconnu ou un appel invalide retourne une
erreur structurée au modèle, qui peut se corriger dans le budget restant.
Le premier `select_attack` valide termine la décision ; les autres appels du même
lot ne peuvent ni remplacer ce choix ni modifier le combat.

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
efficacité × bonus du même type. Les égalités favorisent le plus petit slot. Cette
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

Le branchement HTTP et React n'est pas encore réalisé. Le futur service devra
lire l'instantané avant la décision, appeler la stratégie hors transaction, puis
revérifier le tour et les PP sous transaction avant de résoudre. L'idempotence
devra porter sur la demande du joueur et ne pas dépendre d'un choix IA régénéré.
Le contexte ne constitue donc pas une autorisation d'appliquer un tour périmé.

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

Le scénario est volontairement simple : Pikachu possède Éclair (slot 0) et Charge
(slot 1), face à Sabelette de type Sol. Le choix attendu est Charge ; Éclair est
légal mais inefficace. L'agent peut inspecter la situation, lister les attaques et
consulter les types avant de sélectionner son slot. L'ordre et le nombre d'appels
ne sont pas imposés au LLM. Le choix du joueur n'est utilisé qu'après cette décision.
Le moteur résout alors un tour avec une graine fixe. Cette graine ne rend pas le
modèle déterministe.

Les logs console montrent chaque demande/réponse modèle, chaque résultat d'outil,
le slot retenu, la source de décision et un éventuel repli. Pour les conserver dans
PowerShell, ajouter `2> artifacts/ai-real.log` à la commande. Un refus HTTP est
diagnostiqué par son statut, sans journaliser les en-têtes ou le corps fournisseur.
Les commentaires courts éventuels sont dans la décision du rapport ; aucun
raisonnement interne du modèle n'est demandé ou enregistré.

Le rapport JSON comprend :

- `checks` : slot légal, évitement de l'immunité, slot attendu, sélection par l'agent,
  absence de mutation pendant la décision ;
- `decision` : slot, source et motif éventuel du repli ;
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

Ce mode utilise un faux modèle, affiche `mode="simulation"` et
`real_agent_verified=false`. Il vérifie le scénario et la plomberie des outils,
pas la qualité du LLM. Dans le mode réel, `real_agent_verified=true` exige un choix
de l'agent satisfaisant tous les critères, sans repli. Un seul scénario ne constitue
pas une évaluation générale de la stratégie.
