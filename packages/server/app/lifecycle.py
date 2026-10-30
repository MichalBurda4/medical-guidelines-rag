"""Startup preflight: wait for dependencies, verify the LLM, rebuild the catalogue.

Raising here stops uvicorn, and `docker compose up --wait` reports the reason
instead of letting the container crash-loop quietly.
"""

from __future__ import annotations

import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.concurrency import run_in_threadpool

from app.config import CHROMA_URL, EMBEDDING_MODEL
from app.rag.embed import model_installed, warm_up
from app.rag.llm import llm_availability
from app.rag.retrieve import chroma_available
from app.rag.store import store


def _wait_for(check, description: str, timeout: float) -> None:
    """Poll a dependency during startup instead of relying on container healthchecks.

    The Chroma image ships no shell utilities (no python, curl or wget), so it cannot
    run a probe of its own; waiting here keeps `depends_on` simple and gives a single
    place with an actionable error message.
    """
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if check():
            return
        time.sleep(2)
    raise RuntimeError(f"Timed out waiting for {description}.")


def preflight() -> None:
    """Fail fast: without embeddings, a vector store and an LLM there is no product."""
    _wait_for(chroma_available, f"Chroma at {CHROMA_URL}", timeout=90)
    _wait_for(
        model_installed,
        f"embedding model “{EMBEDDING_MODEL}” in Ollama (run `ollama pull {EMBEDDING_MODEL}`)",
        timeout=120,
    )
    warm_up()  # loads the model and verifies the vector dimension

    available = llm_availability()
    if not (available.openai or available.deepseek):
        raise RuntimeError(
            "No LLM configured. Set OPENAI_API_KEY or DEEPSEEK_API_KEY in "
            ".env at the repo root (or the compose environment)."
        )

    store.hydrate()  # rebuild the document catalogue from Chroma


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await run_in_threadpool(preflight)
    yield
