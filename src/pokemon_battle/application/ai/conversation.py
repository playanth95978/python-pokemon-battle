"""État de continuité et contrat d'adaptation indépendants du fournisseur et du stockage."""

from dataclasses import dataclass, field
from typing import Any, Protocol

from .generation import Completion, Message, ToolCall


@dataclass(slots=True)
class ConversationState:
    conversation_id: str | None = None
    pending_results: list[dict[str, Any]] = field(default_factory=list)
    turns: int = 0
    prompt_tokens: int = 0
    model: str = ""
    # Vide pour les conversations antérieures à ce champ : leur contrat d'outils est inconnu.
    tools_version: str = ""


class ConversationAdapter(Protocol):
    model: str

    async def complete(self, messages: list[Message], *, tools=None, tool_choice="auto") -> Completion: ...

    def record_result(self, call: ToolCall, result: dict[str, Any]) -> None: ...
