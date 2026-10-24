from pokemon_battle.core.exceptions import MistralUnavailable
from pokemon_battle.domain.generation import Completion, Message
from pokemon_battle.mistral.client import MistralClient
from dataclasses import asdict


class MistralLLMAdapter:
    def __init__(self, client: MistralClient, model: str | None = None, max_tokens: int = 700):
        self.client = client
        self.model = model or client.settings.mistral_chat_model
        self.max_tokens = max_tokens

    async def complete(self, messages: list[Message]) -> Completion:
        result = await self.client.post(
            "chat/completions",
            {
                "model": self.model,
                "temperature": 0,
                "top_p": 1,
                "max_tokens": self.max_tokens,
                "prompt_cache_key": "mini-job-rag-v1",
                "messages": [asdict(message) for message in messages],
            },
        )
        try:
            text = result["choices"][0]["message"]["content"]
            if isinstance(text, list):
                text = "".join(
                    part["text"]
                    for part in text
                    if isinstance(part, dict)
                    and part.get("type") == "text"
                    and isinstance(part.get("text"), str)
                )
            usage = result.get("usage") or {}
            if not isinstance(text, str) or not isinstance(usage, dict):
                raise ValueError("Réponse de génération invalide.")
            return Completion(text, usage)
        except (KeyError, IndexError, TypeError, ValueError):
            raise MistralUnavailable() from None
