"""Local embeddings served by Ollama.

The model runs on the machine (or in the `ollama` compose service); no embedding
provider is contacted. Because nothing is cached locally, a missing daemon or a
missing model must surface as a clear error instead of silently degrading.
"""

from __future__ import annotations

import os
import threading

import httpx

BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
MODEL = os.getenv("EMBEDDING_MODEL", "bge-m3")
BATCH_SIZE = int(os.getenv("EMBEDDING_BATCH_SIZE", "32"))
KEEP_ALIVE = os.getenv("OLLAMA_KEEP_ALIVE", "30m")  # keeps the model warm between uploads
REQUEST_TIMEOUT = float(os.getenv("OLLAMA_TIMEOUT", "180"))

# bge-m3 needs no prefixes. Models trained with them (nomic-embed-text uses
# "search_document:" / "search_query:") are configured here, not scattered through
# the pipeline. Both must be set together or neither.
QUERY_PREFIX = os.getenv("EMBEDDING_QUERY_PREFIX", "")
PASSAGE_PREFIX = os.getenv("EMBEDDING_PASSAGE_PREFIX", "")


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
        return self._embed([f"{PASSAGE_PREFIX}{text}" for text in texts])

    def embed_query(self, text: str) -> list[float]:
        return self._embed([f"{QUERY_PREFIX}{text}"])[0]

    def _embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        vectors: list[list[float]] = []
        with self._lock, httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            for start in range(0, len(texts), BATCH_SIZE):
                vectors.extend(self._post(client, texts[start : start + BATCH_SIZE]))

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
                f"{BASE_URL}/api/embed",
                json={"model": MODEL, "input": batch, "keep_alive": KEEP_ALIVE},
            )
        except httpx.RequestError as error:
            raise EmbeddingUnavailable(
                f"Cannot reach Ollama at {BASE_URL}. Start it with `ollama serve` "
                f"or `docker compose up -d ollama`."
            ) from error

        if response.status_code == 404:
            raise EmbeddingUnavailable(
                f"Ollama model “{MODEL}” is not installed. Run: ollama pull {MODEL}"
            )
        if response.status_code >= 400:
            raise EmbeddingUnavailable(
                f"Ollama embedding failed with HTTP {response.status_code}."
            )

        payload = response.json()
        embeddings = payload.get("embeddings")
        if not embeddings or len(embeddings) != len(batch):
            raise EmbeddingUnavailable("Ollama returned an incomplete embedding batch.")
        return embeddings


_embedder: OllamaEmbedder | None = None
_embedder_lock = threading.Lock()


def get_embedder() -> OllamaEmbedder:
    global _embedder
    if _embedder is None:
        with _embedder_lock:
            if _embedder is None:
                _embedder = OllamaEmbedder()
    return _embedder


def model_installed() -> bool:
    """True when Ollama is reachable and has EMBEDDING_MODEL pulled."""
    try:
        response = httpx.get(f"{BASE_URL}/api/tags", timeout=5.0)
        response.raise_for_status()
        tags = response.json().get("models", [])
    except (httpx.HTTPError, ValueError):
        return False

    wanted = MODEL.split(":")[0]
    return any(entry.get("name", "").split(":")[0] == wanted for entry in tags)


def embedding_dim() -> int | None:
    """Dimension of the loaded model, or None before the first embedding call."""
    return get_embedder().dim


def warm_up() -> int:
    """Loads the model and returns its dimension. Raises EmbeddingUnavailable."""
    return len(get_embedder().embed_query("warm-up"))
