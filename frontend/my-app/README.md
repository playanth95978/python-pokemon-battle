# Pokémon Battle — interface React

React, TypeScript, Vite et Tailwind CSS. Interface en français pour le backend FastAPI
du dossier racine. Aucun calcul de combat dans le navigateur.

## Lancer en local

Dans un premier terminal, depuis la racine `pokemon-battle`, avec l'environnement
Python du projet actif et les dépendances backend installées :

```powershell
python -m uvicorn pokemon_battle.api.app:app --app-dir src --port 8000
```

Si Uvicorn n'est pas encore installé : `python -m pip install uvicorn`.

Dans un second terminal, depuis `frontend/my-app` :

```powershell
npm ci
npm run dev
```

Ouvrir l'adresse affichée par Vite, généralement `http://localhost:5173`.
Le proxy de `vite.config.ts` transmet `/api/battles` à
`http://127.0.0.1:8000/battles`. Aucun changement CORS n'est nécessaire en développement.
Si le backend utilise un autre port, adapter la cible du proxy.

## Jouer

1. Choisir les deux Pokémon, puis cliquer sur « Créer le combat ».
2. Choisir une attaque pour chaque combattant, puis cliquer sur « Jouer le tour ».
3. Consulter les PV, PP, le tour et le journal retournés par le serveur.
4. Après le KO, cliquer sur « Nouveau combat » pour rejouer avec les choix du formulaire.

Les deux combattants sont pilotés localement ; aucune IA d'adversaire n'est ajoutée.
Les attaques sans PP sont désactivées. Le catalogue de sélection contient les trois
espèces de démonstration du backend, sans dupliquer leurs statistiques.

## Structure

- `src/battle/BattlePage.tsx` : formulaire et assemblage des composants.
- `BattleArena`, `PokemonCard`, `AttackPanel`, `BattleLog` : affichage et callbacks uniquement.
- `useBattle.ts` : copie unique du dernier état serveur, événements reçus, états de requête.
- `api.ts` : appels HTTP et messages d'erreur.
- `types.ts` : contrats TypeScript correspondant aux DTO FastAPI.

Les PV, PP, tours et vainqueur viennent exclusivement de FastAPI. Les pourcentages
d'affichage et les conditions de boutons sont dérivés pendant le rendu, sans état
React supplémentaire. Les choix de Pokémon et d'attaques sont uniquement de l'état UI.

Les requêtes sont verrouillées synchroniquement pour bloquer les doubles soumissions,
avec boutons désactivés pendant l'attente. Aucun POST n'est envoyé automatiquement au
montage, y compris sous StrictMode. Les requêtes expirent après 15 secondes et sont
annulées au démontage.

Chaque nouvelle demande de tour contient `expected_turn`, repris de l'état serveur,
et un UUID `idempotency_key`. Après une erreur réseau ou 5xx, cliquer sur
« Récupérer le résultat du tour » renvoie exactement la même demande et la même clé.
Si elle était enregistrée, le backend restitue le résultat sans jouer un autre tour.
Le hook relit ensuite le combat par GET pour éviter d'afficher un ancien état.
La clé reste disponible si cette relecture échoue ; aucun POST n'est réessayé automatiquement.

Un conflit 409 exige une relecture. « Relire le combat » reste disponible pour
abandonner la récupération et consulter l'état actuel. Ce GET seul ne récupère
pas les événements perdus, car l'API n'expose pas d'historique complet.
La demande à récupérer est uniquement conservée en mémoire jusqu'au rechargement.
Le redémarrage remplace le combat et vide son journal seulement après création réussie.
Un rechargement complet de la page revient au formulaire initial.

## Vérifications

```powershell
npm test
npm run build
```

Les tests Vitest/Testing Library couvrent le hook, les appels HTTP simulés et le parcours
création → tour → KO → nouveau combat, ainsi que le verrouillage, les erreurs et la
resynchronisation. Ils ne nécessitent pas de serveur démarré.

Le proxy Vite sert au développement. Pour un déploiement, prévoir un reverse proxy
qui transmet `/api/*` à FastAPI en retirant le préfixe `/api` ; le build statique seul
ne fournit pas le backend.
