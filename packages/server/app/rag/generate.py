"""Turn retrieved passages into an answer. An LLM is required; there is no template path."""

from __future__ import annotations

import re

from app.models import AnswerProfile, ChatSource, LlmProvider
from app.rag.chunk import ScoredChunk
from app.rag.llm import complete_chat, resolve_llm_provider
from app.rag.profile import build_llm_system_prompt

EXCERPT_LENGTH = 220

NO_DOCUMENTS_ANSWER = (
    "No documents are indexed yet. Upload guideline files first, then ask your question again."
)

# Used when retrieval finds nothing above the similarity threshold. Answering from
# the LLM's own knowledge is exactly what this project must not do.
NO_CONTEXT_ANSWER = (
    "I could not find relevant context in the uploaded documents for that question. "
    "Try rephrasing, or upload guidelines that cover this topic."
)


def excerpt(text: str, max_len: int = EXCERPT_LENGTH) -> str:
    cleaned = re.sub(r"\s+", " ", text).strip()
    if len(cleaned) <= max_len:
        return cleaned
    return f"{cleaned[: max_len - 1]}…"


def build_sources(chunks: list[ScoredChunk]) -> list[ChatSource]:
    return [
        ChatSource(
            documentName=chunk.document_name,
            excerpt=excerpt(chunk.text),
            score=round(chunk.score, 4),
        )
        for chunk in chunks
    ]


def format_context(passages: list[ScoredChunk]) -> str:
    """Passages carry their section name: without it the LLM cannot tell a
    patient section from a procurement one."""
    return "\n\n".join(
        f"[{index + 1}] Source: {chunk.document_name}"
        f" — section: {chunk.section or 'General'}\n{chunk.text}"
        for index, chunk in enumerate(passages)
    )


def generate_answer(
    question: str,
    passages: list[ScoredChunk],
    profile: AnswerProfile,
    requested_llm: LlmProvider | None = None,
) -> tuple[str, LlmProvider | None, list[ScoredChunk]]:
    """Return (answer, provider, used_passages).

    Provider is None only for the "no relevant context" refusal, where no LLM call
    is made and no sources are reported. Raises LlmUnavailable / LlmRequestError.
    """
    if not passages:
        return NO_CONTEXT_ANSWER, None, []

    llm = resolve_llm_provider(requested_llm)
    answer = complete_chat(
        llm,
        build_llm_system_prompt(profile),
        f"Context:\n{format_context(passages)}\n\nQuestion: {question}",
    )
    return answer, llm, passages
