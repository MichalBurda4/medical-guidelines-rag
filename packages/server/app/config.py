"""Environment configuration, read once at import time.

The API never parses .env itself: docker compose injects the variables through
`env_file`, and local runs export them in the shell (or pass `uv run --env-file`).
Keeping every setting here makes the env surface visible in one place.
"""

from __future__ import annotations

import os

# --- Ollama embeddings ---------------------------------------------------
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "bge-m3")
EMBEDDING_BATCH_SIZE = int(os.getenv("EMBEDDING_BATCH_SIZE", "32"))
OLLAMA_KEEP_ALIVE = os.getenv("OLLAMA_KEEP_ALIVE", "30m")  # keeps the model warm between uploads
OLLAMA_TIMEOUT = float(os.getenv("OLLAMA_TIMEOUT", "180"))

# bge-m3 needs no prefixes. Models trained with them (nomic-embed-text uses
# "search_document:" / "search_query:") are configured here, not scattered through
# the pipeline. Both must be set together or neither.
EMBEDDING_QUERY_PREFIX = os.getenv("EMBEDDING_QUERY_PREFIX", "")
EMBEDDING_PASSAGE_PREFIX = os.getenv("EMBEDDING_PASSAGE_PREFIX", "")

# --- Chroma ---------------------------------------------------------------
CHROMA_URL = os.getenv("CHROMA_URL", "http://127.0.0.1:8000")

# The collection name carries the embedding model: switching EMBEDDING_MODEL
# changes the vector dimension, and Chroma rejects mixed dimensions. Deriving the
# name from the model means a model switch cannot silently reuse the old vectors.
_COLLECTION_SUFFIX = EMBEDDING_MODEL.replace("/", "_").replace(":", "_")
CHROMA_COLLECTION = os.getenv("CHROMA_COLLECTION") or f"chunks_{_COLLECTION_SUFFIX}"
CHROMA_DOCUMENTS_COLLECTION = os.getenv("CHROMA_DOCUMENTS_COLLECTION") or f"documents_{_COLLECTION_SUFFIX}"

# --- Retrieval --------------------------------------------------------------
RETRIEVAL_MIN_SCORE = float(os.getenv("RETRIEVAL_MIN_SCORE", "0.48"))
RETRIEVAL_TOP_K = int(os.getenv("RETRIEVAL_TOP_K", "5"))
RETRIEVAL_MAX_REWRITES = int(os.getenv("RETRIEVAL_MAX_REWRITES", "2"))

# --- LLM ---------------------------------------------------------------------
LLM_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "120"))

# --- HTTP / uploads -----------------------------------------------------------
MAX_UPLOAD_FILES = 10
MAX_UPLOAD_BYTES = 20 * 1024 * 1024

# The client talks to the API through the Vite proxy, so browser requests are
# same-origin. These entries only cover running the dev server on another port.
DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]
