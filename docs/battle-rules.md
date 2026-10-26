# Règles du combat

Ce document fixe les règles appliquées par `BattleEngine`. Elles s'inspirent des jeux
récents mais restent volontairement réduites : une règle absente ici n'existe pas.

## Ordre du tour

1. Les deux choix sont validés avant toute mutation ou tirage.
2. Une potion passe avant une attaque. Entre deux attaques, la priorité la plus haute
   agit d'abord, puis la vitesse effective la plus haute. Une égalité est tranchée
   par un tirage `randint(0, 1)`.
3. Chaque combattant agit à son tour. Un KO empêche la riposte et termine le combat.
4. Si le combat continue, la fin de tour s'applique (brûlure, fin de la protection).

## Déroulé d'une attaque

Dans cet ordre, en s'arrêtant au premier échec :

1. Paralysie : un combattant paralysé tire `randint(1, 100)` ; à 25 ou moins il ne
   peut pas agir (`FullyParalyzed`) et ne consomme aucun PP. Aucun tirage sinon.
2. Un PP est consommé (`AttackUsed`).
3. Protection : une attaque visant un adversaire protégé est bloquée (`AttackBlocked`).
4. Précision : `randint(1, 100)` doit être inférieur ou égal à la précision.
   Une précision non applicable (`None`) ne tire rien et touche toujours.
5. Une attaque à dégâts tire `randint(85, 100)` pour les dégâts, sauf immunité de type.
   Une attaque de statut applique ses effets dans l'ordre, sans tirage.

## Statuts

Un combattant porte au plus un statut ; en appliquer un second échoue
(`EffectFailed`, raison `already_has_status`). Un type Électrik ne peut pas être
paralysé, un type Feu ne peut pas être brûlé (raison `immune`).

- **Paralysie** : vitesse effective divisée par 2 (arrondi inférieur) et 25 % de
  chances de ne pas agir.
- **Brûlure** : dégâts des attaques physiques divisés par 2 ; à la fin de chaque tour,
  perte de 1/16 des PV max (au moins 1, sans descendre sous 0).

Les statuts ne guérissent pas d'eux-mêmes.

## Modifications de statistiques

Chaque statistique hors PV porte un cran de -6 à +6. Le multiplicateur est
(2 + n) / 2 pour n ≥ 0 et 2 / (2 − n) pour n < 0, appliqué avec `Fraction` puis
arrondi à l'entier inférieur (au moins 1). Les crans d'attaque et de défense
(physiques ou spéciaux selon la catégorie) entrent dans la formule de dégâts ; le
cran de vitesse entre dans la vitesse effective, avant la paralysie.

Une modification déjà bloquée à la borne échoue (raison `stat_limit`) ; sinon elle
est tronquée à la borne et `StatChanged` indique le changement réel.

## Protection

Une attaque de protection vise son lanceur et le protège jusqu'à la fin du tour
contre les attaques qui le visent. Utilisée au tour suivant une protection réussie,
elle échoue (raison `consecutive_protection`) ; le jeu officiel emploie une
probabilité décroissante, remplacée ici par une règle déterministe.

## Fin du tour et fin du combat

Les dégâts de brûlure s'appliquent dans l'ordre d'action du tour, chacun suivi de
`KnockedOut` si besoin. Les deux combattants peuvent ainsi tomber KO au même tour :
`BattleEnded.winner` vaut alors `None` et le combat se termine sur un match nul.
`Battle.is_over` distingue un combat terminé d'un combat en cours.

## Hors périmètre

Effets secondaires probabilistes des attaques à dégâts, coups critiques, autres
statuts (sommeil, poison, gel, confusion), immunités d'attaques de statut par type
(par exemple Cage-Éclair contre Sol) et guérison des statuts.
