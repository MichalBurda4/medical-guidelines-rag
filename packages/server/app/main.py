from __future__ import annotations

from contextlib import asynccontextmanager
import logging
import time

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from app.models import (
    ApiError,
    AnswerProfile,
    ChatRequest,
    ChatResponse,
    DeleteResponse,
    DocumentsResponse,
    EmbeddingInfo,
    HealthResponse,
)
from app.rag.embed import (
    EmbeddingUnavailable,
    embedding_dim,
    MODEL as EMBEDDING_MODEL,
    model_installed,
    warm_up,
)
from app.rag.agent import answer_question
from app.rag.generate import NO_DOCUMENTS_ANSWER, build_sources
from app.rag.llm import LlmRequestError, LlmUnavailable, llm_availability
from app.rag.retrieve import CHROMA_URL, chroma_available
from app.rag.store import store

# Uvicorn only configures its own loggers, so the agent's retrieval/rewrite trace
# would be dropped at the root logger's default level. INFO is what makes the
# rewrite loop observable in `docker compose logs`.
logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s - %(message)s")

MAX_UPLOAD_FILES = 10
MAX_UPLOAD_BYTES = 20 * 1024 * 1024

# The client talks to the API through the Vite proxy, so browser requests are
# same-origin. These entries only cover running the dev server on another port.
DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]


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
    """Fail fast: without embeddings, a vector store and an LLM there is no product.

    Raising here stops uvicorn, and `docker compose up --wait` reports the reason
    instead of letting the container crash-loop quietly.
    """
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


app = FastAPI(title="MediRAG API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=DEV_ORIGINS,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)


def _validation_error_message(errors: list[dict]) -> str:
    parts = []
    for error in errors:
        location = ".".join(str(item) for item in error.get("loc", ()) if item != "body")
        message = error.get("msg", "Invalid value")
        parts.append(f"{location}: {message}" if location else message)
    return "; ".join(parts) or "Request failed."


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        llm=llm_availability(),
        embeddings=EmbeddingInfo(
            model=EMBEDDING_MODEL,
            dim=embedding_dim(),
            ready=model_installed(),
        ),
    )


@app.get("/api/documents", response_model=DocumentsResponse)
def documents() -> DocumentsResponse:
    return DocumentsResponse(documents=store.list_documents())


@app.post("/api/documents", response_model=DocumentsResponse, status_code=201)
async def upload_documents(files: list[UploadFile] = File(...)) -> DocumentsResponse:
    if len(files) > MAX_UPLOAD_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"Too many files: {len(files)} uploaded, {MAX_UPLOAD_FILES} allowed.",
        )

    uploaded = []
    for file in files:
        data = await file.read()
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"File “{file.filename}” exceeds the 20 MB limit.",
            )
        try:
            # Parsing, embedding and indexing are blocking work.
            record = await run_in_threadpool(
                store.add,
                file.filename or "upload.bin",
                data,
                file.content_type or "application/octet-stream",
            )
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        except EmbeddingUnavailable as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        uploaded.append(record)

    return DocumentsResponse(documents=uploaded)


@app.delete("/api/documents/{document_id}", response_model=DeleteResponse)
def delete_document(document_id: str) -> DeleteResponse:
    if not store.remove(document_id):
        raise HTTPException(status_code=404, detail="Document not found.")
    return DeleteResponse()


@app.post("/api/chat", response_model=ChatResponse)
def chat(body: ChatRequest) -> ChatResponse:
    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is required.")

    if not store.has_documents():
        return ChatResponse(answer=NO_DOCUMENTS_ANSWER, sources=[], llm=None)

    profile = AnswerProfile(
        languageLevel=body.languageLevel or "adult",
        audience=body.audience or "patient",
    )

    try:
        answer, llm, passages = answer_question(question, profile, body.llm)
    except LlmUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except LlmRequestError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    except EmbeddingUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    return ChatResponse(
        answer=answer,
        sources=build_sources(passages),
        profile=profile,
        llm=llm,
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(_request, exc: HTTPException) -> JSONResponse:
    detail = exc.detail if isinstance(exc.detail, str) else "Request failed."
    return JSONResponse(status_code=exc.status_code, content=ApiError(error=detail).model_dump())


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request, exc: RequestValidationError) -> JSONResponse:
    """Keep the { "error": string } contract for malformed request bodies."""
    return JSONResponse(
        status_code=422,
        content=ApiError(error=_validation_error_message(exc.errors())).model_dump(),
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request, exc: Exception) -> JSONResponse:
    """Unexpected failures (Chroma down, bad vector, ...) must not leak a bare 500.

    The client only understands { "error": string }; a plain-text "Internal Server
    Error" breaks every caller and hides which dependency failed.
    """
    return JSONResponse(
        status_code=500,
        content=ApiError(error=f"Internal error: {type(exc).__name__}").model_dump(),
    )
