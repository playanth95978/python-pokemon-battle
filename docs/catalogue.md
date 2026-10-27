# Catalogue Pokémon

## Périmètre et provenance

L'instantané du 24 octobre 2026 contient **1 025 espèces**, leurs formes par défaut,
18 types, 9 générations et 32 groupes de versions, jusqu'à Pokémon Champions.
Les formes régionales, Méga-Évolutions et autres variantes ne constituent pas
des entrées supplémentaires. Un groupe rassemble les éditions associées et peut
représenter un DLC. Les espèces annoncées pour un jeu futur et absentes de PokéAPI
ne sont pas inventées.

Les CSV officiels proviennent de [PokeAPI/pokeapi](https://github.com/PokeAPI/pokeapi/tree/2bf639e5572812a67d2b94903fdcb9d095f5aeb2/data/v2/csv),
révision épinglée dans `scripts/import_pokeapi.py`. L'instantané JSON est livré dans
le package Python, sous `data/catalogue.json`. Le démarrage et les combats ne font
aucun appel réseau au catalogue externe. L'API `GET /catalogue` expose uniquement
les métadonnées de sélection, sans statistiques ni formules de combat.

## Catégories et versions

Les catégories utilisent les indicateurs PokéAPI `is_legendary`, `is_mythical` et
`is_baby` ; « Ordinaire » signifie aucun de ces trois indicateurs. Les types
correspondent à la forme par défaut actuelle, et non aux types historiques de
chaque génération. La recherche accepte noms français, anglais et numéro national.

Le filtre de version utilise `pokemon_dex_numbers` et `pokedex_version_groups`.
Il indique la présence d'une espèce dans un Pokédex régional associé à un groupe
de versions, sans distinguer les exclusivités d'édition, les événements, la capture
ou la disponibilité par transfert. Les extensions suivent les associations PokéAPI.
Un groupe sans Pokédex associé (notamment Colosseum et XD) ne retourne aucune entrée ;
cela ne signifie pas que ces jeux ne contiennent aucun Pokémon.

## Dates

PokéAPI ne fournit pas de date de sortie individuelle pour chaque espèce. Avec
l'accord du demandeur, les dates affichées sont celles des jeux et du lancement
des générations, pas une affirmation sur la première disponibilité d'un Pokémon
particulier. Le tri chronologique utilise le début de génération puis le numéro national.

Les dates des jeux sont les premières sorties des titres correspondants, et non
les dates françaises. Les premières générations sont donc datées selon leurs
sorties japonaises. Rouge/Bleu international est distingué de Rouge/Vert japonais.
Les dates commerciales peuvent différer d'un jour selon les fuseaux horaires,
notamment pour les extensions déployées simultanément.

Sources des dates : [chronologie des sorties](https://bulbapedia.bulbagarden.net/wiki/List_of_games_by_release_date),
[Rouge/Vert, site officiel japonais](https://www.pokemon.co.jp/game/other/gb-rg/),
[Légendes Z-A](https://asia-press.portal-pokemon.com/products/video-game/pokemon-legends-z-a/),
[Méga-Dimension](https://asia-press.portal-pokemon.com/press-release/pokemon-legends-z-a-mega-dimension-brings-additional-story-and-content-on-wednesday_20251110/),
[Champions](https://asia-press.portal-pokemon.com/products/mobile-app/pokemon-champions/).

## Combats simplifiés

Toutes les espèces peuvent être choisies pour un combat. Les nouvelles définitions
utilisent des statistiques effectives au niveau 50 : IV et EV nuls, nature neutre,
PV = base + 60, autres statistiques = base + 5 ; Munja conserve un PV.
Les trois démonstrations initiales gardent leurs statistiques et attaques historiques,
quel que soit l'alias français ou anglais utilisé.

Le kit de démonstration de Pikachu ajoute Éclair (Électrik, spécial, puissance 40,
précision 100, 30 PP) avant les attaques importées, sans changer ses statistiques.
Ce complément explicite permet de montrer un effet électrique issu d'un vrai
événement métier. Les instantanés des combats déjà créés restent inchangés.

Les attaques sont sélectionnées parmi les apprentissages par niveau jusqu'au
niveau 50 présents dans les CSV, au plus quatre, en privilégiant les références
récentes. Les attaques à dégâts n'ont que des dégâts directs (`effect_id=1`) :
aucun effet secondaire probabiliste n'est simulé. Ce n'est pas une
reconstitution des attaques légales d'une version sélectionnée : les filtres du
catalogue ne modifient pas les règles du moteur. Aucun talent n'est simulé.

Un kit contient au plus une attaque de statut ; les autres emplacements restent
des attaques à dégâts, pour qu'un combat puisse toujours se terminer. Une attaque
de statut n'est importée que si tous ses effets sont appliqués par le moteur
(`move_meta` et `move_meta_stat_changes`) :

- paralysie ou brûlure garantie (`meta_category_id=1`, `meta_ailment_id` 1 ou 4) ;
- crans d'attaque, de défense, d'attaque ou de défense spéciale, ou de vitesse
  (`meta_category_id=2`, statistiques 2 à 6), sans précision ni esquive ;
- protection (`effect_id=112` : Abri, Détection).

La cible doit être le lanceur ou l'adversaire ; « tous les adversaires » désigne
l'adversaire unique d'un duel. Une attaque visant son lanceur ne fait aucun test
de précision. Sommeil, poison, gel, confusion, précision, esquive et effets
combinés sont écartés. L'instantané du 27 octobre 2026 donne ainsi une attaque de
statut à 939 espèces.

Pour 214 espèces sans attaque admissible, le simulateur fournit explicitement
Charge comme kit de repli. Le catalogue signale « Kit de combat simplifié » pour
ces espèces ; cette attaque de repli ne prétend pas être apprise dans les jeux.
Les animations des attaques non reconnues utilisent l'impact générique existant.
Les combats déjà enregistrés conservent leurs instantanés de statistiques et attaques.

## Mise à jour

```powershell
python scripts/import_pokeapi.py
python -m pytest -q
```

L'import est reproductible pour la révision épinglée et réutilise les téléchargements
dans `.cache/pokeapi/` (ignoré par Git). Pour actualiser la source, modifier la révision,
vérifier les nouveaux groupes et leurs dates puis relancer l'import et les tests.
Les tests de taille de l'instantané doivent être ajustés explicitement après examen
des nouvelles données. Redémarrer FastAPI après une mise à jour du catalogue pour
invalider son cache en mémoire. Les métadonnées n'exigent aucune migration SQLite.
