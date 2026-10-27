"""Format JSON des effets d'attaque, partagé par la persistance et le catalogue importé."""

from pokemon_battle.domain import ApplyStatus, AttackEffect, BattleStat, ModifyStat, Protect, StatusCondition


def serialize_effect(effect: AttackEffect) -> dict:
    """Effet marqué par "effect_type" : asdict seul perdrait sa classe (Protect() deviendrait {})."""
    if isinstance(effect, ApplyStatus):
        return {"effect_type": "apply_status", "condition": effect.condition.value}
    if isinstance(effect, ModifyStat):
        return {"effect_type": "modify_stat", "stat": effect.stat.value, "stages": effect.stages}
    if isinstance(effect, Protect):
        return {"effect_type": "protect"}
    raise ValueError("Effet d'attaque inconnu")


def deserialize_effect(data: dict) -> AttackEffect:
    effect_type = data.get("effect_type")
    if effect_type == "apply_status":
        return ApplyStatus(StatusCondition(data["condition"]))
    if effect_type == "modify_stat":
        return ModifyStat(BattleStat(data["stat"]), data["stages"])
    if effect_type == "protect":
        return Protect()
    raise ValueError("Effet d'attaque inconnu")
