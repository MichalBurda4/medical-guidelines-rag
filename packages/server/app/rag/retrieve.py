"""Retrieval: Chroma (HNSW, cosine) queried with local Ollama embeddings.

Chroma returns a *distance*; callers only ever see a similarity in [0, 1]. The
conversion lives here and nowhere else. A passage below RETRIEVAL_MIN_SCORE is
dropped, so an off-topic question yields no sources instead of confident noise.
"""

from __future__ import annotations

from urllib.parse import urlsplit

import chromadb
from chromadb.api.models.Collection import Collection

from app.config import (
    CHROMA_COLLECTION,
    CHROMA_DOCUMENTS_COLLECTION,
    CHROMA_URL,
    RETRIEVAL_MIN_SCORE,
    RETRIEVAL_TOP_K,
)
from app.rag.chunk import ScoredChunk
from app.rag.embed import embedder

# Explicit cosine. Do not rely on the default: it is L2, and `1 - distance` would
# then not be a similarity.
_COSINE = {"hnsw": {"space": "cosine"}}


_client: chromadb.ClientAPI | None = None


def get_client() -> chromadb.ClientAPI:
    """Lazily built shared client.

    Constructing a client contacts the server (it fetches the user identity), so
    this must not happen at import time: importing the app has to work while
    Chroma is still booting. The preflight owns the "is it up yet?" waiting.
    """
    global _client
    if _client is None:
        # urlsplit needs a scheme to read host/port; accept scheme-less URLs too
        # (e.g. `chroma:8000` inside compose).
        parsed = urlsplit(CHROMA_URL if "://" in CHROMA_URL else f"//{CHROMA_URL}")
        _client = chromadb.HttpClient(
            host=parsed.hostname or "127.0.0.1",
            port=parsed.port or 8000,
        )
    return _client


def chroma_available() -> bool:
    """True when the Chroma server answers. Used by the startup preflight."""
    try:
        get_client().heartbeat()
        return True
    except Exception:
        return False


# Collections are resolved per call, not cached: a cached handle keeps a collection
# UUID that goes stale if the collection is dropped or the server loses its volume.
# `get_or_create_collection` is a single cheap request compared to an embedding call.
def chunks_collection() -> Collection:
    """embedding_function=None: Chroma must never fetch a model of its own."""
    return get_client().get_or_create_collection(
        name=CHROMA_COLLECTION,
        configuration=_COSINE,
        embedding_function=None,
    )


def documents_collection() -> Collection:
    return get_client().get_or_create_collection(
        name=CHROMA_DOCUMENTS_COLLECTION,
        configuration=_COSINE,
        embedding_function=None,
    )


def _query_hits(query: str, top_k: int) -> list[ScoredChunk]:
    """Nearest chunks, unfiltered: callers decide what counts as relevant."""
    if not query.strip():
        return []

    collection = chunks_collection()
    if collection.count() == 0:
        return []

    result = collection.query(
        query_embeddings=[embedder.embed_query(query)],
        n_results=top_k,
        include=["documents", "metadatas", "distances"],
    )

    documents = (result.get("documents") or [[]])[0]
    metadatas = (result.get("metadatas") or [[]])[0]
    distances = (result.get("distances") or [[]])[0]

    hits: list[ScoredChunk] = []
    for text, metadata, distance in zip(documents, metadatas, distances):
        score = 1.0 - float(distance)  # cosine distance → similarity
        hits.append(
            ScoredChunk(
                document_id=str(metadata.get("document_id", "")),
                document_name=str(metadata.get("document_name", "")),
                text=text or "",
                section=metadata.get("section") or None,
                score=score,
            )
        )
    return hits


def search_with_scores(query: str, top_k: int = RETRIEVAL_TOP_K) -> tuple[list[ScoredChunk], float]:
    """Return the passages that pass the threshold plus the *unfiltered* best score.

    The agent needs the raw best score to tell a rewrite "you are close" (0.47)
    from "you are unrelated" (0.12); reporting 0.0 for everything below the
    threshold would send it in the wrong direction.
    """
    hits = _query_hits(query, top_k)
    best = round(max((hit.score for hit in hits), default=0.0), 3)
    return [hit for hit in hits if hit.score >= RETRIEVAL_MIN_SCORE], best


def search(query: str, top_k: int = RETRIEVAL_TOP_K) -> list[ScoredChunk]:
    """The only retrieval entry point for callers that do not need raw scores."""
    return search_with_scores(query, top_k=top_k)[0]
