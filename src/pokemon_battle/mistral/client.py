from typing import Any
import logging

import httpx

from pokemon_battle.core.config import Settings
from pokemon_battle.core.exceptions import MissingCredentials, MistralTimeout, MistralUnavailable

logger = logging.getLogger(__name__)


class MistralClient:
    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        self.settings = settings
        self.http = httpx.AsyncClient(base_url="https://api.mistral.ai/v1/", timeout=60, transport=transport)

    async def post(self, endpoint: str, payload: dict[str, Any]) -> dict[str, Any]:
        key = self.settings.mistral_api_key.get_secret_value()
        if not key or key == "remplacer_par_votre_cle":
            raise MissingCredentials()
        try:
            response = await self.http.post(
                endpoint, json=payload, headers={"Authorization": f"Bearer {key}"}
            )
            response.raise_for_status()
            result = response.json()
            if not isinstance(result, dict):
                raise ValueError("Objet JSON attendu.")
            return result
        except httpx.TimeoutException:
            raise MistralTimeout() from None
        except httpx.HTTPStatusError as error:
            # Le statut suffit au diagnostic, sans exposer clé, en-têtes ou corps fournisseur.
            logger.warning("Requête Mistral refusée statut_http=%s", error.response.status_code)
            raise MistralUnavailable() from None
        except (httpx.HTTPError, ValueError):
            raise MistralUnavailable() from None

    async def aclose(self) -> None:
        await self.http.aclose()
