"""Importer un instantané reproductible des CSV officiels PokéAPI, sans lancer l'application."""

import csv
import json
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
REVISION = "2bf639e5572812a67d2b94903fdcb9d095f5aeb2"
BASE = f"https://raw.githubusercontent.com/PokeAPI/pokeapi/{REVISION}/data/v2/csv/"
FILES = ["pokemon_species", "pokemon_species_names", "pokemon", "pokemon_stats", "pokemon_types",
         "types", "type_names", "version_groups", "versions", "version_names", "generation_names",
         "pokedex_version_groups", "pokemon_dex_numbers", "pokemon_moves", "moves", "move_names",
         "move_meta", "move_meta_stat_changes"]
CACHE = ROOT / ".cache" / "pokeapi" / REVISION

# Identifiants PokéAPI des seuls effets de statut appliqués par le moteur (docs/battle-rules.md).
STATUS_CLASS = "1"
META_AILMENT, META_STATS = "1", "2"
PROTECT_EFFECT = "112"
AILMENTS = {"1": "paralysis", "4": "burn"}
STATS = {2: "attack", 3: "defense", 4: "special_attack", 5: "special_defense", 6: "speed"}
# En duel, « tous les adversaires » désigne l'unique adversaire.
TARGETS = {"7": "self", "10": "opponent", "11": "opponent"}

# Première sortie d'un jeu, pas une date d'apparition individuelle de chaque espèce.
# Sources et portée documentées dans docs/catalogue.md.
RELEASES = {
    "red-green-japan": "1996-02-27", "blue-japan": "1996-10-15", "red-blue": "1998-09-28",
    "yellow": "1998-09-12", "gold-silver": "1999-11-21", "crystal": "2000-12-14",
    "ruby-sapphire": "2002-11-21", "colosseum": "2003-11-21", "firered-leafgreen": "2004-01-29",
    "emerald": "2004-09-16", "xd": "2005-08-04", "diamond-pearl": "2006-09-28",
    "platinum": "2008-09-13", "heartgold-soulsilver": "2009-09-12", "black-white": "2010-09-18",
    "black-2-white-2": "2012-06-23", "x-y": "2013-10-12", "omega-ruby-alpha-sapphire": "2014-11-21",
    "sun-moon": "2016-11-18", "ultra-sun-ultra-moon": "2017-11-17",
    "lets-go-pikachu-lets-go-eevee": "2018-11-16", "sword-shield": "2019-11-15",
    "the-isle-of-armor": "2020-06-17", "the-crown-tundra": "2020-10-22",
    "brilliant-diamond-shining-pearl": "2021-11-19", "legends-arceus": "2022-01-28",
    "scarlet-violet": "2022-11-18", "the-teal-mask": "2023-09-13", "the-indigo-disk": "2023-12-14",
    "legends-za": "2025-10-16", "mega-dimension": "2025-12-10", "champions": "2026-04-08",
}


def download(name):
    path = CACHE / f"{name}.csv"
    if not path.exists():
        data = urlopen(BASE + name + ".csv", timeout=90).read()
        path.write_bytes(data)
    return name


def rows(name):
    with (CACHE / f"{name}.csv").open(encoding="utf-8", newline="") as source:
        yield from csv.DictReader(source)


def localized(name, key):
    return {int(row[key]): row for row in rows(name) if row["local_language_id"] == "5"}


def status_attack(move, meta, changes, types, names):
    """Attaque de statut au format du catalogue, ou None si l'un de ses effets n'est pas géré."""
    target = TARGETS.get(move["target_id"])
    if move["damage_class_id"] != STATUS_CLASS or target is None or meta is None or int(move["type_id"]) not in types:
        return None
    effects = _status_effects(move, meta, changes)
    if effects is None:
        return None
    return {"name": names.get(int(move["id"]), {}).get("name", move["identifier"]),
            "type": types[int(move["type_id"])], "power": None,
            # Une attaque visant son lanceur ne fait aucun test de précision.
            "accuracy": None if target == "self" or not move["accuracy"] else int(move["accuracy"]),
            "max_pp": int(move["pp"]), "category": "status", "target": target,
            "priority": int(move["priority"]), "effects": effects}


def _status_effects(move, meta, changes):
    if move["effect_id"] == PROTECT_EFFECT:
        return [{"effect_type": "protect"}] if TARGETS[move["target_id"]] == "self" and not changes else None
    ailment = AILMENTS.get(meta["meta_ailment_id"])
    if meta["meta_category_id"] == META_AILMENT and ailment and not changes and meta["ailment_chance"] == "0":
        return [{"effect_type": "apply_status", "condition": ailment}]
    if (meta["meta_category_id"] == META_STATS and changes and meta["meta_ailment_id"] == "0"
            and meta["stat_chance"] == "0" and all(stat in STATS for stat, _ in changes)):
        return [{"effect_type": "modify_stat", "stat": STATS[stat], "stages": change} for stat, change in changes]
    return None


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=4) as executor:
        for name in executor.map(download, FILES):
            print(f"Lu : {name}", flush=True)
    names = localized("pokemon_species_names", "pokemon_species_id")
    type_names = localized("type_names", "type_id")
    move_names = localized("move_names", "move_id")
    version_names = localized("version_names", "version_id")
    generation_names = localized("generation_names", "generation_id")
    types = {int(row["id"]): row["identifier"] for row in rows("types") if int(row["id"]) <= 18}
    stats = defaultdict(dict)
    for row in rows("pokemon_stats"):
        stats[int(row["pokemon_id"])][int(row["stat_id"])] = int(row["base_stat"])
    pokemon_types = defaultdict(list)
    for row in rows("pokemon_types"):
        pokemon_types[int(row["pokemon_id"])].append(types[int(row["type_id"])])
    defaults = {int(row["species_id"]): int(row["id"]) for row in rows("pokemon") if row["is_default"] == "1"}
    version_labels = defaultdict(list)
    for row in rows("versions"):
        version_labels[int(row["version_group_id"])].append(
            version_names.get(int(row["id"]), {}).get("name", row["identifier"]))
    groups = {int(row["id"]): {"id": int(row["id"]), "key": row["identifier"],
                               "name": " / ".join(version_labels[int(row["id"])]),
                               "generation": int(row["generation_id"]),
                               "release_date": RELEASES.get(row["identifier"]), "order": int(row["order"])}
              for row in rows("version_groups")}
    dex_groups = defaultdict(set)
    for row in rows("pokedex_version_groups"):
        dex_groups[int(row["pokedex_id"])].add(int(row["version_group_id"]))
    memberships = defaultdict(set)
    for row in rows("pokemon_dex_numbers"):
        memberships[int(row["species_id"])].update(dex_groups[int(row["pokedex_id"])])
    # N'utiliser que des attaques de dégâts directs, sans effet secondaire non implémenté.
    moves = {int(row["id"]): row for row in rows("moves") if row["power"] and row["effect_id"] == "1"
             and row["damage_class_id"] in ("2", "3") and int(row["power"]) > 0 and int(row["type_id"]) in types}
    meta = {int(row["move_id"]): row for row in rows("move_meta")}
    stat_changes = defaultdict(list)
    for row in rows("move_meta_stat_changes"):
        stat_changes[int(row["move_id"])].append((int(row["stat_id"]), int(row["change"])))
    status_moves = {}
    for row in rows("moves"):
        attack = status_attack(row, meta.get(int(row["id"])), stat_changes.get(int(row["id"]), []), types, move_names)
        if attack is not None:
            status_moves[int(row["id"])] = attack
    candidates, status_candidates = defaultdict(dict), defaultdict(dict)
    default_ids = set(defaults.values())
    for row in rows("pokemon_moves"):
        pid, mid = int(row["pokemon_id"]), int(row["move_id"])
        if pid not in default_ids or row["pokemon_move_method_id"] != "1" or int(row["level"]) > 50:
            continue
        pool = candidates if mid in moves else status_candidates if mid in status_moves else None
        if pool is None:
            continue
        # Dernière occurrence connue d'une attaque apprise avant le niveau 50.
        score = (groups[int(row["version_group_id"])]["order"], int(row["level"]))
        pool[pid][mid] = max(pool[pid].get(mid, (0, 0)), score)
    species = []
    fallback_count = 0
    for row in rows("pokemon_species"):
        sid = int(row["id"])
        pid = defaults[sid]
        base = stats[pid]
        # Au plus une attaque de statut : les autres emplacements gardent des dégâts pour finir le combat.
        status = sorted(status_candidates[pid], key=lambda mid: (status_candidates[pid][mid], -mid), reverse=True)[:1]
        selected = sorted(candidates[pid], key=lambda mid: (candidates[pid][mid], moves[mid]["type_id"] in
                                                            [str(key) for key, value in types.items() if
                                                             value in pokemon_types[pid]], -mid),
                          reverse=True)[:4 - len(status)]
        if not selected:
            selected = [33]  # Charge : repli explicite du simulateur pour les espèces sans attaque admissible.
            fallback_count += 1
        attacks = [{"name": move_names.get(mid, {}).get("name", moves[mid]["identifier"]),
                    "type": types[int(moves[mid]["type_id"])], "power": int(moves[mid]["power"]),
                    "accuracy": int(moves[mid]["accuracy"] or "100"), "max_pp": int(moves[mid]["pp"]),
                    "category": "physical" if moves[mid]["damage_class_id"] == "2" else "special"}
                   for mid in selected] + [status_moves[mid] for mid in status]
        species.append({"id": sid, "pokemon_id": pid, "key": row["identifier"], "name": names[sid]["name"],
                        "genus": names[sid]["genus"], "generation": int(row["generation_id"]),
                        "types": pokemon_types[pid], "legendary": row["is_legendary"] == "1",
                        "mythical": row["is_mythical"] == "1", "baby": row["is_baby"] == "1",
                        "versions": sorted(memberships[sid]), "stats": {"hp": 1 if sid == 292 else base[1] + 60,
                                                                        "attack": base[2] + 5, "defense": base[3] + 5,
                                                                        "special_attack": base[4] + 5,
                                                                        "special_defense": base[5] + 5,
                                                                        "speed": base[6] + 5},
                        "attacks": attacks, "fallback_attack": not bool(candidates[pid])})
    generations = [{"id": gid, "name": entry["name"], "release_date": min(
        group["release_date"] for group in groups.values() if group["generation"] == gid and group["release_date"])}
                   for gid, entry in generation_names.items()]
    output = {"source": f"https://github.com/PokeAPI/pokeapi/tree/{REVISION}/data/v2/csv",
              "updated_at": date.today().isoformat(),
              "species": species, "generations": generations,
              "versions": sorted(groups.values(), key=lambda group: (group["release_date"] or "9999", group["order"])),
              "types": [{"key": key, "name": type_names[tid]["name"]} for tid, key in types.items()]}
    destination = ROOT / "src" / "pokemon_battle" / "data" / "catalogue.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Importé : {len(species)} espèces ; {fallback_count} kits de repli")


if __name__ == "__main__":
    main()
