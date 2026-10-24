"""Messages et réponses nécessaires au dialogue avec un modèle et ses outils."""

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class ToolCall:
    id: str
    name: str
    arguments: str


@dataclass(frozen=True, slots=True)
class Message:
    role: str
    content: str | None
    tool_calls: tuple[ToolCall, ...] = ()
    tool_call_id: str | None = None
    name: str | None = None


@dataclass(frozen=True, slots=True)
class Completion:
    text: str | None
    usage: dict[str, Any]
    tool_calls: tuple[ToolCall, ...] = ()


@dataclass(frozen=True, slots=True)
class Answer:
    answer: str
    usage: dict[str, Any]
    cached_prompt_tokens: int
