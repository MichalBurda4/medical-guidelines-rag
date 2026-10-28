"""Query rewriting for the retrieval agent.

A user asks in their own words, not in a guideline's words: "what operational
points matter for hay fever season" says nothing that a chunk titled
"Business / service delivery notes" shares, so the embedding score lands below the
similarity threshold even though the document answers it. Instead of lowering the
threshold — which would also let off-topic questions through — the agent retries
retrieval with a rewritten query.

The rewrite never answers the question and never adds medical facts. It only
rephrases, which keeps the "grounded in retrieved context" guarantee intact.
"""

from __future__ import annotations

import re

from app.models import AnswerProfile, LlmProvider
from app.rag.llm import complete_chat

MAX_QUERY_CHARS = 240

REWRITE_SYSTEM_PROMPT = """You rewrite a question into ONE search query for a medical \
guideline vector database.

Rules:
- Output only the query, on a single line. No preamble, no quotes, no explanation.
- Keep the medical topic and the intent of the original question.
- Never answer the question. Never add drugs, doses, numbers or advice that the \
user did not mention.
- Use the vocabulary a clinical guideline would use, not casual wording.
- Match the audience: a patient query uses symptom/treatment wording; a business \
query uses service-delivery wording (demand peaks, stock planning, staffing, \
patient education, call-centre load).
- If earlier attempts are listed, take a clearly different angle. Repeating the \
same wording scores the same and wastes a retrieval.
"""


def _audience_hint(profile: AnswerProfile) -> str:
    if profile.audience == "business":
        return "business decision-maker (service delivery and operational angle)"
    return "patient (symptoms, treatment, safety)"


def _clean(raw: str) -> str:
    line = next((candidate for candidate in raw.splitlines() if candidate.strip()), "")
    cleaned = line.strip().strip("\"'`").strip()
    cleaned = re.sub(r"^(?:query|search query)\s*:\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned[:MAX_QUERY_CHARS]


def rewrite_query(
    provider: LlmProvider,
    question: str,
    profile: AnswerProfile,
    tried: list[dict[str, object]],
) -> str:
    """Return a retrieval query that aims at the same intent as `question`."""
    attempts = "\n".join(
        f'- "{entry["query"]}" → best similarity {entry["bestScore"]}' for entry in tried
    )
    user = (
        f"Question: {question}\n"
        f"Audience: {_audience_hint(profile)}\n"
        f"Previous queries:\n{attempts or '- none'}\n\n"
        "Write the new query."
    )
    query = _clean(complete_chat(provider, REWRITE_SYSTEM_PROMPT, user))
    # An empty or identical rewrite would score exactly the same, so report the
    # failure instead of padding the query with made-up keywords.
    if not query or query.lower() in {str(entry["query"]).lower() for entry in tried}:
        return ""
    return query
