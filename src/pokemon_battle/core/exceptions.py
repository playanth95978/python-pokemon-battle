"""Erreurs applicatives, sans dépendance au transport HTTP."""


class ApplicationError(Exception):
    status_code = 500
    detail = "Erreur interne."


class MissingCredentials(ApplicationError):
    status_code = 503
    detail = "Configurer MISTRAL_API_KEY dans .env."


class MistralUnavailable(ApplicationError):
    status_code = 502
    detail = "Échec de la requête Mistral ; vérifier la clé, le modèle et les quotas."


class MistralTimeout(ApplicationError):
    status_code = 504
    detail = "Mistral ne répond pas à temps."


class InvalidEmbedding(ApplicationError):
    status_code = 502
    detail = "Embeddings invalides : vecteurs non nuls de 1024 dimensions attendus."


class VectorStoreUnavailable(ApplicationError):
    status_code = 503
    detail = "Vespa indisponible : vérifier Docker et le déploiement du schéma."


class NoDocuments(ApplicationError):
    status_code = 404
    detail = "Indexer un document avant de poser une question."
