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
Les attaques sans PP sont désactivées. `GET /catalogue` fournit les 1 025 espèces
de l'instantané PokéAPI, sans dupliquer leurs statistiques. Les sélecteurs sont
groupés par génération ; le panneau « Catalogue des Pokémon » ajoute recherche,
types, catégories, générations, versions datées et tri chronologique ou alphabétique.
Les résultats sont paginés par 24 et permettent de choisir l'un ou l'autre combattant.
Si le catalogue complet est indisponible, les trois démonstrations restent proposées
avec un bouton pour réessayer. Voir `../../docs/catalogue.md` pour les dates et limites.

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

## Illustrations et animations

L'interface reprend le modèle HTML fourni : fond bleu nuit, combattants en diagonale,
fiches de PV dans l'arène, commandes à gauche du combat sur grand écran et journal
sous le terrain. Sous 1000 px, les commandes passent sous l'arène. Les deux attaques
restent choisies explicitement, conformément au contrat actuel de FastAPI.

`pokemonArtwork.ts` appelle `https://pokeapi.co/api/v2/pokemon/{id}/` pour lire
uniquement les URL d'illustrations. Les noms français sont associés aux identifiants
PokéAPI fournis par le catalogue complet. Les réponses sont partagées en mémoire et
conservées dans le cache de session. Une illustration officielle manquante ou cassée
se replie sur le sprite, puis sur un emplacement neutre ; une panne de PokéAPI
n'empêche pas de jouer. Ces appels d'illustration ne servent pas aux calculs du combat.

Pour les espèces sans modèle local, `renderAttack3D.ts` superpose aux images 2D des effets WebGL Three.js
en vraie 3D : particules de feu pour Flammèche, gouttes pour Pistolet à O, lianes
segmentées pour les attaques Plante et onde d'impact pour les autres types.
`attackVfx.ts` est partagé par les deux rendus : charge lumineuse, projection puis
ondes et étincelles à l'impact. Les attaques électriques ont six arcs ramifiés,
les attaques Feu un jet de particules allongées, l'Eau des gouttes et les attaques
Plante des segments verts. Un échec ou une immunité ne déclenche pas d'onde d'impact.

Le bouton **Lancer le POC 3D** crée un combat Pikachu contre Salamèche via FastAPI.
Ces deux espèces disposent de vrais modèles locaux `.glb` stylisés, assemblés par
groupes articulés, avec les clips repos, attaque, impact et KO. Il ne s'agit pas de
modèles officiels. Le terrain, les éclairages, les ombres et les projectiles sont
rendus dans la même scène Three.js. Pikachu dispose d'Éclair dans son kit de
démonstration. Relancer FastAPI et créer un nouveau combat pour obtenir ce kit :
les combats existants conservent leur instantané d'attaques.
Glisser dans l'arène fait tourner la caméra, la molette zoome et les boutons
permettent aussi de tourner ou recentrer. Le bouton **Voir en 2D** change de rendu.

`BattleScene3D` charge le moteur graphique à la demande et lui transmet la projection
d'affichage des événements serveur et le clip à lire. Aucune règle de combat n'est calculée
par Three.js. Un fichier absent ou une perte de contexte WebGL ramène aux images.
Les modèles peuvent être régénérés avec `npm run models:poc` ; leur provenance
est décrite dans `public/models/poc/README.md`.

Les effets suivent les événements serveur dans leur ordre, sans rejouer les tours
déjà affichés, sans riposte inventée après KO et sans impact en cas d'immunité ou
d'échec. Pendant leur lecture, les commandes du tour suivant sont bloquées ; un
nouveau combat reste possible et annule la lecture précédente. Les PP sont révélés
au début de chaque attaque, les PV et le KO à l'impact (65 % du clip), puis le
vainqueur à la fin du dernier clip. Le journal suit cette même progression.
`battlePresentation` dérive cet affichage à partir des résultats FastAPI et des
événements non encore révélés, sans stocker une deuxième copie du combat ni recalculer
les dégâts. Désactiver les animations affiche immédiatement le résultat complet.
Un GET plus récent que le journal local reste affiché tel quel.

Les événements `attack_used` portent `attack_type` (type élémentaire stable) et
`attack_slot` (position de l'attaque). Les effets utilisent le type, jamais le nom
traduit. Les anciens reçus sans ces champs restent lisibles et utilisent un effet
générique. Les noms restent réservés à l'affichage.

Le composant `BattleSession` conserve uniquement le curseur de lecture et les choix UI.
Le bouton « Animations d'attaque » permet de désactiver les effets. La préférence
`prefers-reduced-motion` les désactive également. Sans WebGL, un effet CSS de repli
reste disponible. Dans le POC, désactiver les animations ou demander les mouvements
réduits conserve la scène et la caméra, mais fige les mouvements automatiques.
Three.js se charge à l'ouverture d'une scène 3D ou à la première attaque 2D ; son
chunk d'environ 587 kB minifiés déclenche l'avertissement indicatif de taille Vite,
sans empêcher le build. Les ressources GPU, écouteurs et boucles de rendu sont
libérés lors du changement de vue ou du démontage.

## Sons des attaques

**Activer le son** crée un contexte Web Audio pendant le clic, conformément aux
restrictions d'autoplay. Le volume est réglable et le son est désactivé par défaut.
Les bruitages sont synthétisés localement : charge et crépitement électriques,
souffle de feu, eau, fouet et impact. Aucun extrait audio des jeux ni service externe.
La projection commence à 22 % du clip et l'impact à 65 %, comme les effets visuels.
Le bruit d'impact n'est joué que pour un résultat serveur `hit`.
Changer le volume ne rejoue pas l'attaque. Activer le son en cours d'attaque prend
effet à la suivante. Masquer l'onglet, couper le son, désactiver les animations ou
redémarrer le combat arrête les sources. Sans Web Audio, le combat reste utilisable.
Les mouvements réduits désactivent la lecture des clips et donc leurs bruitages.

## Remplacement des modèles reporté

Les démarches Sketchfab sont abandonnées à la demande de l'utilisateur. Les fichiers
intégrés restent les modèles locaux du POC. La recherche avait identifié deux
modèles animés du même artiste, anak3d, annoncés sous CC BY 4.0 :

- [Pikachu](https://sketchfab.com/3d-models/0025-pikachu-3d-a90e7b35382846af92ddb557b5b6d372)
- [Salamèche](https://sketchfab.com/3d-models/0004-charmander-3d-cd7ee496f0564ccba2276960071b4a85)

La visionneuse est publique, mais le téléchargement demande une connexion Sketchfab.
Les fichiers n'ont pas été récupérés ni intégrés. Leur format et leurs clips
exportés n'ont donc pas été validés. Le chargeur utilise `SkeletonUtils.clone`
pour préserver les skins lors d'un futur remplacement des modèles.
