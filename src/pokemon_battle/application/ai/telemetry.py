"""Mesures d'une décision, sans clé, prompt brut ni raisonnement interne du modèle."""

from dataclasses import dataclass, field
import logging
from typing import Any

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class DecisionMetrics:
    model_requests: int = 0
    model_responses: int = 0
    tool_calls_requested: int = 0
    tool_calls_executed: int = 0
    precomputed_tools: int = 0
    tool_errors: int = 0
    model_time_ms: float = 0
    elapsed_ms: float = 0
    # Une clé absente signifie « non communiqué », pas zéro token.
    tokens: dict[str, int] = field(default_factory=dict)
    usage_reports: int = 0
    complete_usage_reports: int = 0
    trace: list[dict[str, Any]] = field(default_factory=list)

    def add_usage(self, usage: dict[str, Any]) -> None:
        reported = 0
        for name in ("prompt_tokens", "completion_tokens", "total_tokens"):
            value = usage.get(name)
            if type(value) is int and value >= 0:
                self.tokens[name] = self.tokens.get(name, 0) + value
                reported += 1
        self.usage_reports += int(reported > 0)
        self.complete_usage_reports += int(reported == 3)

    def event(self, event: str, **details: Any) -> None:
        self.trace.append({"event": event, **details})
        logger.info("Agent %s %s", event, details)
