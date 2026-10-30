"""Local embeddings served by Ollama.

The model runs on the machine (or in the `ollama` compose service); no embedding
provider is contacted. Because nothing is cached locally, a missing daemon or a
missing model must surface as a clear error instead of silently degrading.
"""

from __future__ import annotations

import threading

import httpx

from app.config import (
    EMBEDDING_BATCH_SIZE,
    EMBEDDING_MODEL,
    EMBEDDING_PASSAGE_PREFIX,
    EMBEDDING_QUERY_PREFIX,
    OLLAMA_BASE_URL,
    OLLAMA_KEEP_ALIVE,
    OLLAMA_TIMEOUT,
)


class EmbeddingUnavailable(RuntimeError):
    """Ollama is down, the model is missing, or the response was unusable."""


class OllamaEmbedder:
    """Thread-safe: uploads and chats hit the API from different threads."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._dim: int | None = None

    @property
    def dim(self) -> int | None:
        return self._dim

    def embed_passages(self, texts: list[str]) -> list[list[float]]:
        return self._embed([f"{EMBEDDING_PASSAGE_PREFIX}{text}" for text in texts])

    def embed_query(self, text: str) -> list[float]:
        return self._embed([f"{EMBEDDING_QUERY_PREFIX}{text}"])[0]

    def _embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        vectors: list[list[float]] = []
        with self._lock, httpx.Client(timeout=OLLAMA_TIMEOUT) as client:
            for start in range(0, len(texts), EMBEDDING_BATCH_SIZE):
                vectors.extend(self._post(client, texts[start : start + EMBEDDING_BATCH_SIZE]))

        if self._dim is None:
            self._dim = len(vectors[0])
        elif any(len(vector) != self._dim for vector in vectors):
            raise EmbeddingUnavailable(
                f"Ollama returned inconsistent dimensions; expected {self._dim}. "
                f"Switching EMBEDDING_MODEL requires a new CHROMA_COLLECTION."
            )
        return vectors

    def _post(self, client: httpx.Client, batch: list[str]) -> list[list[float]]:
        try:
            response = client.post(
                f"{OLLAMA_BASE_URL}/api/embed",
                json={"model": EMBEDDING_MODEL, "input": batch, "keep_alive": OLLAMA_KEEP_ALIVE},
            )
        except httpx.RequestError as error:
            raise EmbeddingUnavailable(
                f"Cannot reach Ollama at {OLLAMA_BASE_URL}. Start it with `ollama serve` "
                f"or `docker compose up -d ollama`."
            ) from error

        if response.status_code == 404:
            raise EmbeddingUnavailable(
                f"Ollama model “{EMBEDDING_MODEL}” is not installed. Run: ollama pull {EMBEDDING_MODEL}"
            )
        if response.status_code >= 400:
            raise EmbeddingUnavailable(
                f"Ollama embedding failed with HTTP {response.status_code}."
            )

        try:
            payload = response.json()
        except ValueError as error:
            raise EmbeddingUnavailable("Ollama returned a malformed response.") from error

        embeddings = payload.get("embeddings") if isinstance(payload, dict) else None
        if not embeddings or len(embeddings) != len(batch):
            raise EmbeddingUnavailable("Ollama returned an incomplete embedding batch.")
        return embeddings


# One shared instance: its lock serialises embedding calls, and the dimension
# check must observe every response, so a second instance would weaken both.
embedder = OllamaEmbedder()


def model_installed() -> bool:
    """True when Ollama is reachable and has EMBEDDING_MODEL pulled."""
    try:
        response = httpx.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5.0)
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError):
        return False

    tags = payload.get("models", []) if isinstance(payload, dict) else []
    wanted = EMBEDDING_MODEL.split(":")[0]
    return any(entry.get("name", "").split(":")[0] == wanted for entry in tags)


def embedding_dim() -> int | None:
    """Dimension of the loaded model, or None before the first embedding call."""
    return embedder.dim


def warm_up() -> int:
    """Loads the model and returns its dimension. Raises EmbeddingUnavailable."""
    return len(embedder.embed_query("warm-up"))
