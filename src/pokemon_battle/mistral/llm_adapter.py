import json
from typing import Any

from pokemon_battle.application.ai.generation import Completion, Message, ToolCall
from pokemon_battle.core.exceptions import MistralUnavailable
from pokemon_battle.mistral.client import MistralClient


def _message_payload(message: Message) -> dict[str, Any]:
    result: dict[str, Any] = {"role": message.role, "content": message.content}
    if message.tool_calls:
        result["tool_calls"] = [{"id": call.id, "type": "function", "function": {
            "name": call.name, "arguments": call.arguments,
        }} for call in message.tool_calls]
    if message.tool_call_id is not None:
        result["tool_call_id"] = message.tool_call_id
    if message.name is not None:
        result["name"] = message.name
    return result


def _tool_call(data: Any) -> ToolCall:
    if not isinstance(data, dict) or data.get("type") != "function":
        raise ValueError("Appel de fonction attendu.")
    function = data["function"]
    identifier, name, arguments = data["id"], function["name"], function["arguments"]
    if not isinstance(identifier, str) or not identifier or not isinstance(name, str) or not name:
        raise ValueError("Identifiant et nom d'outil attendus.")
    if isinstance(arguments, dict):
        arguments = json.dumps(arguments, ensure_ascii=False)
    if not isinstance(arguments, str):
        raise ValueError("Arguments d'outil invalides.")
    return ToolCall(identifier, name, arguments)


class MistralLLMAdapter:
    def __init__(self, client: MistralClient, model: str | None = None, max_tokens: int = 700):
        self.client = client
        self.model = model or client.settings.mistral_chat_model
        self.max_tokens = max_tokens

    async def complete(
        self, messages: list[Message], *, tools: list[dict[str, Any]] | None = None,
        tool_choice: str = "auto",
    ) -> Completion:
        payload: dict[str, Any] = {
            "model": self.model, "temperature": 0, "top_p": 1,
            "max_tokens": self.max_tokens,
            "messages": [_message_payload(message) for message in messages],
        }
        if tools:
            payload.update(tools=tools, tool_choice=tool_choice)
        result = await self.client.post(
            "chat/completions", payload,
        )
        try:
            message = result["choices"][0]["message"]
            text = message.get("content")
            raw_calls = message.get("tool_calls")
            if raw_calls is None:
                raw_calls = []
            if not isinstance(raw_calls, list):
                raise ValueError("Liste d'appels d'outils attendue.")
            calls = tuple(_tool_call(call) for call in raw_calls)
            if len({call.id for call in calls}) != len(calls):
                raise ValueError("Identifiants d'appels dupliqués.")
            if isinstance(text, list):
                text = "".join(
                    part["text"]
                    for part in text
                    if isinstance(part, dict)
                    and part.get("type") == "text"
                    and isinstance(part.get("text"), str)
                )
            usage = result.get("usage")
            if usage is None:
                usage = {}
            if (
                (text is not None and not isinstance(text, str))
                or (text is None and not calls)
                or not isinstance(usage, dict)
            ):
                raise ValueError("Réponse de génération invalide.")
            return Completion(text, usage, calls)
        except (KeyError, IndexError, TypeError, ValueError, AttributeError):
            raise MistralUnavailable() from None
