# Modèles du POC

`pikachu.glb` et `charmander.glb` sont des modèles stylisés construits localement
avec des primitives Three.js par `scripts/build-poc-models.mjs`.
Aucun maillage, texture ou modèle extrait des jeux n'est inclus. Les personnages
Pokémon restent la propriété de leurs ayants droit ; ces fichiers ne sont pas
des modèles officiels.

Chaque GLB contient un assemblage articulé de groupes et quatre clips : `Idle`,
`Attack`, `Hit`, `Faint`. Il ne contient pas de squelette de skinning.
Pour régénérer les fichiers depuis le dossier frontend : `npm run models:poc`.

Le POC utilise seulement ces deux espèces. Les autres conservent les illustrations
PokéAPI ; une erreur de modèle ou une indisponibilité WebGL déclenche ce même repli.
