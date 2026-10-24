from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class Message:
    role: str
    content: str

@dataclass(frozen=True)
class Completion:
    text: str
    usage: dict[str, Any]

@dataclass(frozen=True)
class Answer:
    answer: str
    usage: dict[str, Any]
    cached_prompt_tokens: int
