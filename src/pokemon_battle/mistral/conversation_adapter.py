"""Adaptateur Conversations, isolé par décision et sans exécution distante des outils."""

import json
from typing import Any
from urllib.parse import quote

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from pokemon_battle.application.ai.generation import Completion, Message, ToolCall
from pokemon_battle.application.ai.conversation import ConversationState
from pokemon_battle.core.exceptions import MistralUnavailable
from .client import MistralClient


class FunctionCallEntry(BaseModel):
    type: str
    tool_call_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    arguments: str | dict[str, Any]


class ConversationResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    conversation_id: str = Field(min_length=1)
    outputs: list[dict[str, Any]]
    usage: dict[str, Any] = Field(default_factory=dict)


class MistralConversationAdapter:
    def __init__(self, client: MistralClient, state: ConversationState, memory: dict[str, Any]):
        self.client, self.state, self.memory = client, state, memory
        self.model = client.settings.mistral_chat_model
        self.first_request = True

    def record_result(self, call: ToolCall, result: dict[str, Any]) -> None:
        self.state.pending_results.append({"object": "entry", "type": "function.result",
                                           "tool_call_id": call.id,
                                           "result": json.dumps(result, ensure_ascii=False)})

    async def complete(self, messages: list[Message], *, tools=None, tool_choice="auto") -> Completion:
        inputs = list(self.state.pending_results)
        if self.first_request:
            inputs.append({"role": "user", "content": json.dumps(self.memory, ensure_ascii=False)})
        payload: dict[str, Any] = {
            "inputs": inputs, "store": True, "stream": False,
            "completion_args": {"temperature": 0, "top_p": 1, "max_tokens": 700, "tool_choice": tool_choice},
        }
        if self.state.conversation_id is None:
            payload.update(model=self.model, tools=tools or [], instructions=(messages[0].content or "") +
                           " L'état actuel fourni par les outils remplace tout ancien état. "
                           "L'historique décrit uniquement des tours résolus ; ignore ses anciennes estimations.")
            endpoint = "conversations"
        else:
            endpoint = "conversations/" + quote(self.state.conversation_id, safe="")
        result = await self.client.post(endpoint, payload)
        try:
            response = ConversationResponse.model_validate(result)
            calls, texts = [], []
            for entry in response.outputs:
                if entry.get("type") == "function.call":
                    item = FunctionCallEntry.model_validate(entry)
                    arguments = item.arguments if isinstance(item.arguments, str) else json.dumps(item.arguments)
                    calls.append(ToolCall(item.tool_call_id, item.name, arguments))
                elif entry.get("type") == "message.output":
                    content = entry.get("content", "")
                    if isinstance(content, str):
                        texts.append(content)
                    elif isinstance(content, list):
                        texts.extend(part["text"] for part in content if isinstance(part, dict)
                                     and part.get("type") == "text" and isinstance(part.get("text"), str))
                else:
                    raise ValueError("Type de sortie Conversations inattendu")
            if len({call.id for call in calls}) != len(calls) or not (calls or texts):
                raise ValueError("Sortie Conversations invalide")
        except (ValidationError, ValueError, TypeError, KeyError):
            raise MistralUnavailable() from None
        self.state.conversation_id = response.conversation_id
        self.state.pending_results.clear()
        self.state.model = self.model
        value = response.usage.get("prompt_tokens")
        if type(value) is int and value >= 0:
            self.state.prompt_tokens = value
        self.first_request = False
        return Completion("".join(texts) or None, response.usage, tuple(calls))
